# Offline behavioral tests. PowerShell functions replace gh, Invoke-RestMethod (a fake ChatGPT Sites board),
# Start-Sleep and the clock, so no GitHub/Sites requests, posts or real waits occur.
# Saved as UTF-8 with BOM: Windows PowerShell 5.1 reads a BOM-less script as ANSI and breaks the Thai literals.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\tools\team-board.ps1')
# Human alerts are recorded, never played: the real Send-BoardAlert runs alert.ps1 (beeps and a Windows toast).
$script:alertCalls = New-Object System.Collections.ArrayList
function Send-BoardAlert {
    param([hashtable]$Ctx, [string]$Message, [string]$Level = 'blocked')
    [void]$script:alertCalls.Add([pscustomobject]@{ Agent = [string]$Ctx.AgentId; Message = $Message; Level = $Level })
}
$scratch = Join-Path $PSScriptRoot ('.scratch-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($scratch)
$script:assertions = 0
$script:comments = @()
$script:postCalls = 0
$script:failGet = $false
$script:badJson = $false
$script:repoPrivate = $true
$script:uncertainPost = $false
$script:ghGetEndpoints = New-Object System.Collections.ArrayList
$script:sitesPosts = New-Object System.Collections.ArrayList
$script:sitesLanes = @{}
$script:sitesPeople = @{}
$script:sitesNextId = 1
$script:sitesCalls = New-Object System.Collections.ArrayList
$script:sitesDown = $false
$script:sitesHtml = $false
$script:testBypass = 'bypass-TEST-7f3a9c2e51d4'
$script:testSecret = 'secret-TEST-4b8d0e6a93c1'
$script:fakeNow = [DateTime]::new(2026, 11, 21, 3, 0, 0, [DateTimeKind]::Utc)
$script:sleeps = New-Object System.Collections.ArrayList
$savedEnvironment = @{}
foreach ($key in $script:BoardConfigKeys) { $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key); [Environment]::SetEnvironmentVariable($key, $null) }

function Assert-BoardTest([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "FAILED: $Message" }
    $script:assertions++
}
function New-TestComment([long]$Id, [string]$Login, [string]$Body) {
    [pscustomobject]@{ id = $Id; user = @{ login = $Login }; body = $Body; html_url = "https://example.invalid/comment/$Id"; created_at = $script:fakeNow.AddMinutes($Id).ToString('yyyy-MM-ddTHH:mm:ssZ') }
}
function Get-BoardUtcNow { return $script:fakeNow }
function Start-Sleep {
    param([int]$Seconds = 0, [int]$Milliseconds = 0)
    [void]$script:sleeps.Add($Seconds)
    $script:fakeNow = $script:fakeNow.AddSeconds($Seconds)
}
function gh {
    $global:LASTEXITCODE = 0
    $argumentText = $args -join ' '
    if ($argumentText -eq 'api user') { return '{"login":"tester"}' }
    if ($argumentText -eq 'api repos/team/competition') { return (ConvertTo-Json -InputObject @{ private = $script:repoPrivate } -Compress) }
    if ($argumentText -match '^api repos/team/competition/issues/(\d+)$') { return "{`"state`":`"open`",`"html_url`":`"https://example.invalid/board/$($Matches[1])`"}" }
    if ($argumentText -match 'api --method GET .*comments') {
        [void]$script:ghGetEndpoints.Add([string]$args[3])
        if ($script:failGet) { $global:LASTEXITCODE = 1; return 'failed' }
        if ($script:badJson) { return 'not-json' }
        # Two pages exercises --paginate --slurp flattening, including an empty page.
        $first = @($script:comments | Select-Object -First 2)
        $second = @($script:comments | Select-Object -Skip 2)
        return (ConvertTo-Json -InputObject @($first, $second) -Depth 10 -Compress)
    }
    if ($argumentText -match 'api --method POST .*comments --input') {
        $inputIndex = [array]::IndexOf($args, '--input')
        $payload = [IO.File]::ReadAllText($args[$inputIndex + 1]) | ConvertFrom-Json
        $script:postCalls++
        $newId = 100 + $script:postCalls
        $posted = New-TestComment $newId 'tester' $payload.body
        $script:comments += $posted
        if ($script:uncertainPost) { $global:LASTEXITCODE = 1; return 'connection lost after server accepted' }
        return ($posted | ConvertTo-Json -Depth 10 -Compress)
    }
    throw "Unexpected gh call in offline test: $argumentText"
}
function New-FakeWebError([int]$Status, [string]$Reason) { return (New-Object System.Net.WebException ("The remote server returned an error: ($Status) $Reason.")) }
# Fake Sites board: same routes and JSON shapes as docs/board/sites-dashboard.md.
function Invoke-RestMethod {
    param([string]$Uri, [string]$Method = 'Get', [hashtable]$Headers = @{}, $Body = $null, [string]$ContentType = '', [int]$TimeoutSec = 0,
        [switch]$UseBasicParsing, [string]$OutFile = '', [int]$MaximumRedirection = 5)
    $bodyText = ''
    if ($null -ne $Body) { $bodyText = [Text.Encoding]::UTF8.GetString([byte[]]$Body) }
    $verb = $Method.ToUpperInvariant()
    [void]$script:sitesCalls.Add([pscustomobject]@{ Method = $verb; Uri = $Uri; Headers = $Headers.Clone(); Body = $bodyText; ContentType = $ContentType; TimeoutSec = $TimeoutSec; MaximumRedirection = $MaximumRedirection })
    if ($script:sitesDown) { throw (New-Object System.Net.WebException ("Unable to connect to the remote server (request had Bearer $script:testBypass and $script:testSecret)")) }
    if ($script:sitesHtml) { [IO.File]::WriteAllText($OutFile, '<html><body>Sign in with ChatGPT</body></html>'); return }
    if ($Headers['OAI-Sites-Authorization'] -ne "Bearer $script:testBypass" -or $Headers['Authorization'] -ne "Bearer $script:testSecret") { throw (New-FakeWebError 401 'Unauthorized') }
    $target = [Uri]$Uri
    $query = @{}
    foreach ($pair in $target.Query.TrimStart('?').Split('&')) { if ($pair) { $kv = $pair.Split('=', 2); $query[$kv[0]] = [Uri]::UnescapeDataString($kv[1]) } }
    $path = $target.AbsolutePath
    $response = $null
    if ($verb -eq 'POST' -and $path -eq '/api/posts') {
        $in = $bodyText | ConvertFrom-Json
        if ([string]::IsNullOrEmpty([string]$in.text) -or ([string]$in.text).Length -gt 2000) { throw (New-FakeWebError 400 'Bad Request') }
        $existing = @($script:sitesPosts | Where-Object { $_.post_key -eq $in.post_key })
        if ($existing.Count -gt 0) { $response = @{ post = $existing[0]; duplicate = $true } }
        else {
            $post = [pscustomobject]@{ id = $script:sitesNextId; created_at = $script:fakeNow.ToString('yyyy-MM-ddTHH:mm:ssZ'); lane = $in.lane; type = $in.type; to_lanes = @($in.to_lanes); text = $in.text; sha = $in.sha; post_key = $in.post_key }
            $script:sitesNextId++
            [void]$script:sitesPosts.Add($post)
            $response = @{ post = $post; duplicate = $false }
        }
    }
    elseif ($verb -eq 'GET' -and $path -eq '/api/posts') {
        $after = [long]$query['after']
        $limit = 50
        if ($query.ContainsKey('limit')) { $limit = [int]$query['limit'] }
        $matching = @($script:sitesPosts | Where-Object { ([long]$_.id -gt $after) -and ((-not $query.ContainsKey('to')) -or (@($_.to_lanes) -contains $query['to'])) } | Select-Object -First $limit)
        $response = @{ posts = $matching; last_id = ($script:sitesNextId - 1) }
    }
    elseif ($verb -eq 'PUT' -and $path -match '^/api/people/([A-C])$') {
        $person = $Matches[1]
        $in = $bodyText | ConvertFrom-Json
        if ([string]::IsNullOrEmpty([string]$in.summary) -or ([string]$in.summary).Length -gt 400) { throw (New-FakeWebError 400 'Bad Request') }
        $card = [pscustomobject]@{ person = $person; summary = $in.summary; lane = $in.lane; updated_at = $script:fakeNow.ToString('yyyy-MM-ddTHH:mm:ssZ') }
        $script:sitesPeople[$person] = $card
        $response = @{ person = $card }
    }
    elseif ($verb -eq 'GET' -and $path -eq '/api/people') { $response = @{ people = @($script:sitesPeople.Values) } }
    elseif ($verb -eq 'PUT' -and $path -match '^/api/lanes/([A-C][0-3])$') {
        $lane = $Matches[1]
        $in = $bodyText | ConvertFrom-Json
        $card = [pscustomobject]@{ lane = $lane; person = $in.person; feature_id = $in.feature_id; slug = $in.slug; tier = $in.tier; status = $in.status; note = $in.note; sha = $in.sha; blocked = $in.blocked; updated_at = $script:fakeNow.ToString('yyyy-MM-ddTHH:mm:ssZ') }
        $script:sitesLanes[$lane] = $card
        $response = @{ lane = $card }
    }
    elseif ($verb -eq 'GET' -and $path -eq '/api/lanes') { $response = @{ lanes = @($script:sitesLanes.Values); team = @{} } }
    else { throw (New-FakeWebError 404 'Not Found') }
    [IO.File]::WriteAllText($OutFile, (ConvertTo-Json -InputObject $response -Depth 10 -Compress), [Text.UTF8Encoding]::new($false))
}
# Runs a block while capturing stderr (board warnings go to stderr so hook stdout stays clean).
function Invoke-Captured([scriptblock]$Block) {
    $writer = New-Object IO.StringWriter
    $previous = [Console]::Error
    [Console]::SetError($writer)
    $out = ''
    $failure = $null
    try { $out = (& $Block | Out-String) }
    catch { $failure = $_.Exception.Message }
    finally { [Console]::SetError($previous) }
    return [pscustomobject]@{ Out = $out; Err = $writer.ToString(); Failure = $failure }
}
function Test-NoToken([string]$Value) { return (-not $Value.Contains($script:testBypass)) -and (-not $Value.Contains($script:testSecret)) }
function Get-SitesCallCount([string]$Verb, [string]$Pattern) { return @($script:sitesCalls | Where-Object { $_.Method -eq $Verb -and $_.Uri -match $Pattern }).Count }

try {
    # ===== Part 1: GitHub only (Sites not configured) keeps every original behaviour =====
    $none = Join-Path $scratch 'no-secrets.env'
    $base = @{ Repo = 'team/competition'; Issue = 1; AgentId = 'A'; StateRoot = (Join-Path $scratch 'state'); SecretsFile = $none }
    $failed = $false
    try { Invoke-TeamBoard -Repo 'https://github.com/team/competition' -Issue 1 -AgentId A -SecretsFile $none | Out-Null } catch { $failed = $true }
    Assert-BoardTest $failed 'rejects URL instead of explicit repository slug'
    $failed = $false
    try { Invoke-TeamBoard -Repo team/competition -Issue 1 -AgentId '../A' -SecretsFile $none | Out-Null } catch { $failed = $true }
    Assert-BoardTest $failed 'rejects path-like AgentId'
    $check = Invoke-TeamBoard -Mode Check @base | Out-String
    Assert-BoardTest ($check -match 'tester' -and $check -match 'private=True' -and $check -match 'Sites: not used') 'Check reports identity, private board and GitHub-only mode without posting'
    Assert-BoardTest ($script:postCalls -eq 0 -and $script:sitesCalls.Count -eq 0) 'Check never posts and never calls Sites when unconfigured'

    $script:comments = @((New-TestComment 1 'peer' '[C/Codex] TO:A TO:B ready'), (New-TestComment 2 'tester' '[A/Codex] my own message'))
    $firstRead = Invoke-TeamBoard -Mode Read @base | Out-String
    Assert-BoardTest ($firstRead -match 'ready' -and $firstRead -match 'MENTION') 'Read displays and flags addressed message'
    Assert-BoardTest (-not ($firstRead -match 'my own message')) 'Read filters only same-login same-agent own post'
    $cursor = @(Get-ChildItem -LiteralPath $base.StateRoot -Filter 'cursor-*.json' | Where-Object { $_.Name -notmatch 'watch|sites' })[0].FullName
    Assert-BoardTest ((([IO.File]::ReadAllText($cursor) | ConvertFrom-Json).lastId) -eq 2) 'Read advances cursor after both new comments'
    $again = Invoke-TeamBoard -Mode Read @base | Out-String
    Assert-BoardTest ($again -match 'No new posts') 'Read does not repeat acknowledged messages'
    Assert-BoardTest ($script:ghGetEndpoints[-1] -match 'since=2026-11-21T03:00:00Z') 'GitHub read fetches only comments since the last one read'

    $script:comments += New-TestComment 3 'tester' '[B/Codex] TO:A same-account other-agent delivery'
    $third = Invoke-TeamBoard -Mode Read @base | Out-String
    Assert-BoardTest ($third -match 'other-agent delivery') 'separate agent labels are not filtered merely by same account'
    $otherBase = $base.Clone(); $otherBase.AgentId = 'B'
    $otherRead = Invoke-TeamBoard -Mode Read @otherBase | Out-String
    Assert-BoardTest ($otherRead -match 'COMMENT 1') 'agent cursor namespace is independent'

    $script:comments += @((New-TestComment 4 'peer' '[C/Codex] STATUS C1 F01 R setup merged'), (New-TestComment 5 'peer' '[LEAD] LEAD: BUDGET A 18% B 22% C 25%'),
        (New-TestComment 6 'peer' '[C/Codex] NEED TO:B pdf-parse please'), (New-TestComment 7 'peer' '[LEAD] LEAD: OPEN P1 checkpoint passed'), (New-TestComment 8 'peer' '[C1/Codex] SETUP READY 1a2b3c4d'))
    $filtered = Invoke-TeamBoard -Mode Read @base | Out-String
    Assert-BoardTest ($filtered -match 'LEAD: OPEN P1' -and $filtered -match 'SETUP READY') 'LEAD: OPEN and SETUP READY reach every lane without a TO: tag'
    Assert-BoardTest (-not ($filtered -match 'STATUS C1|LEAD: BUDGET|pdf-parse')) 'STATUS, LEAD: BUDGET and posts for other lanes are not delivered'

    $cursorBefore = [IO.File]::ReadAllText($cursor)
    $script:failGet = $true
    $failed = $false
    try { Invoke-TeamBoard -Mode Read @base | Out-Null } catch { $failed = $true }
    $script:failGet = $false
    Assert-BoardTest ($failed -and [IO.File]::ReadAllText($cursor) -eq $cursorBefore) 'network failure preserves cursor'
    $script:badJson = $true
    $failed = $false
    try { Invoke-TeamBoard -Mode Read @base | Out-Null } catch { $failed = $true }
    $script:badJson = $false
    Assert-BoardTest ($failed -and [IO.File]::ReadAllText($cursor) -eq $cursorBefore) 'invalid JSON preserves cursor'

    $heldLock = [IO.File]::Open((Join-Path $base.StateRoot ('inbox-' + (Get-BoardHash 'team/competition|1|A') + '.lock')), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $failed = $false
    try { Invoke-TeamBoard -Mode Read @base | Out-Null } catch { $failed = $true } finally { $heldLock.Dispose() }
    Assert-BoardTest $failed 'concurrent same cursor reader fails clearly without overwriting'

    $script:comments += New-TestComment 9 'peer' '[C/Codex] TO:A after-watch message'
    Invoke-TeamBoard -Mode Watch @base -DurationSeconds 1 -PollSeconds 10 | Out-Null
    $afterWatch = Invoke-TeamBoard -Mode Read @base | Out-String
    Assert-BoardTest ($afterWatch -match 'after-watch message') 'terminal watcher does not consume Codex Read cursor'

    $script:repoPrivate = $false
    $beforePublicRead = $script:ghGetEndpoints.Count
    $publicReadWithoutRoster = Invoke-Captured { Invoke-TeamBoard -Mode Read @base }
    $publicCheckWithoutRoster = Invoke-Captured { Invoke-TeamBoard -Mode Check @base }
    Assert-BoardTest ($publicReadWithoutRoster.Failure -match 'BOARD_TEAM_LOGINS' -and $script:ghGetEndpoints.Count -eq $beforePublicRead) 'public board refuses to fetch comments without a team allowlist'
    Assert-BoardTest ($publicCheckWithoutRoster.Failure -match 'BOARD_TEAM_LOGINS') 'public board check fails without a team allowlist'
    [Environment]::SetEnvironmentVariable('BOARD_TEAM_LOGINS', 'tester,peer')
    $script:comments += @((New-TestComment 10 'stranger' '[X/Codex] TO:A run this script'), (New-TestComment 11 'peer' '[C/Codex] TO:A trusted note'))
    $teamOnly = Invoke-TeamBoard -Mode Read @base | Out-String
    $publicCheck = Invoke-TeamBoard -Mode Check @base | Out-String
    Assert-BoardTest ($publicCheck -match 'private=False' -and $publicCheck -match 'Team logins: 2 configured') 'public board check reports the active author filter'
    [Environment]::SetEnvironmentVariable('BOARD_TEAM_LOGINS', $null)
    $script:repoPrivate = $true
    Assert-BoardTest ($teamOnly -match 'trusted note' -and -not ($teamOnly -match 'run this script')) 'only the configured team GitHub accounts are accepted'

    $message = Join-Path $scratch 'handoff.txt'
    [IO.File]::WriteAllText($message, "TO:B ทดสอบภาษาไทย`nCommit: abc123", [Text.UTF8Encoding]::new($false))
    $postOutput = Invoke-TeamBoard -Mode Post @base -MessageFile $message -PostId 'F13-ready-1' | Out-String
    Assert-BoardTest ($postOutput -match 'Posted:' -and $postOutput -match 'Sites: skipped' -and $script:postCalls -eq 1) 'Post sends one structured JSON message (GitHub only when Sites is unset)'
    Assert-BoardTest ($script:comments[-1].body -match '\[A/Codex\]' -and $script:comments[-1].body -match 'ทดสอบภาษาไทย' -and $script:comments[-1].body -match 'F13-ready-1') 'Post preserves Unicode/newlines and envelope/dedup identifier'
    $duplicate = Invoke-TeamBoard -Mode Post @base -MessageFile $message -PostId 'F13-ready-1' | Out-String
    Assert-BoardTest ($duplicate -match 'Already posted' -and $script:postCalls -eq 1) 'same stable delivery identifier reconciles without duplicate post'

    $script:uncertainPost = $true
    $failed = $false
    try { Invoke-TeamBoard -Mode Post @base -MessageFile $message -PostId 'F13-uncertain-1' | Out-Null } catch { $failed = $_.Exception.Message -match 'uncertain' }
    $script:uncertainPost = $false
    Assert-BoardTest $failed 'accepted-but-response-lost send reports uncertain outcome'
    $reconciled = Invoke-TeamBoard -Mode Post @base -MessageFile $message -PostId 'F13-uncertain-1' | Out-String
    Assert-BoardTest ($reconciled -match 'Already posted' -and $script:postCalls -eq 2) 'uncertain send can be reconciled using the same identifier'

    [IO.File]::WriteAllText($cursor, 'broken-cursor', [Text.UTF8Encoding]::new($false))
    $failed = $false
    try { Invoke-TeamBoard -Mode Read @base | Out-Null } catch { $failed = $true }
    Assert-BoardTest ($failed -and [IO.File]::ReadAllText($cursor) -eq 'broken-cursor') 'corrupt cursor is preserved instead of silently reset'
    Assert-BoardTest (@(Get-ChildItem -LiteralPath $base.StateRoot -Filter 'post-*.json').Count -eq 0) 'temporary post payloads are removed'

    # ===== Part 2: ChatGPT Sites (fake) + GitHub mirror =====
    [Environment]::SetEnvironmentVariable('SITES_URL', 'https://board.example.invalid')
    [Environment]::SetEnvironmentVariable('SITES_BYPASS_TOKEN', $script:testBypass)
    [Environment]::SetEnvironmentVariable('BOARD_SECRET', $script:testSecret)
    [Environment]::SetEnvironmentVariable('BOARD_TEAM_LOGINS', 'tester,peer')
    $script:comments = @()
    $s = @{ Repo = 'team/competition'; Issue = 2; StateRoot = (Join-Path $scratch 'state-sites'); SecretsFile = $none }

    $siteCheck = Invoke-TeamBoard -Mode Check @s -AgentId C1 | Out-String
    Assert-BoardTest ($siteCheck -match 'Sites: OK' -and $siteCheck -match 'Read source: sites' -and (Test-NoToken $siteCheck)) 'Check reports Sites health without printing tokens'

    $r = Invoke-Captured { Invoke-TeamBoard -Mode Post @s -AgentId A1 -Text 'DONE F09 inbox merged abc1234 saveMessage() ใช้ได้แล้ว TO:B2 TO:C2' -PostId 'F09-A1-done-1' }
    $p1 = $script:sitesPosts[0]
    Assert-BoardTest ($r.Out -match 'Sites: posted id=1' -and $r.Out -match 'Posted:' -and $script:sitesPosts.Count -eq 1) 'post writes to Sites and mirrors to GitHub'
    Assert-BoardTest ($p1.lane -eq 'A1' -and $p1.type -eq 'DONE' -and (@($p1.to_lanes) -join ',') -eq 'B2,C2,A0' -and $p1.sha -eq 'abc1234' -and $p1.post_key -eq 'A1:F09-A1-done-1' -and $p1.text -match 'ใช้ได้แล้ว') 'Sites post carries lane, type, TO lanes (plus the author orchestrator for a worker DONE), sha, idempotency key and intact Thai text'
    Assert-BoardTest ($script:comments[-1].body.StartsWith('[A1/Codex] DONE F09') -and $script:comments[-1].body -match 'team-board-post:tester:A1:F09-A1-done-1') 'GitHub mirror keeps the [LANE/Codex] prefix and dedup marker'
    $postCall = @($script:sitesCalls | Where-Object { $_.Method -eq 'POST' })[0]
    Assert-BoardTest ($postCall.Headers['OAI-Sites-Authorization'] -eq "Bearer $script:testBypass" -and $postCall.Headers['Authorization'] -eq "Bearer $script:testSecret") 'Sites calls send the bypass token and BOARD_SECRET headers'
    Assert-BoardTest ($postCall.ContentType -match 'charset=utf-8' -and $postCall.TimeoutSec -gt 0 -and $postCall.MaximumRedirection -eq 0) 'Sites calls use UTF-8 JSON, a timeout and no redirects'
    Assert-BoardTest ((Test-NoToken $r.Out) -and (Test-NoToken $r.Err)) 'successful post prints no token'
    $postCallsBefore = $script:postCalls
    $dup = Invoke-TeamBoard -Mode Post @s -AgentId A1 -Text 'DONE F09 inbox merged abc1234 saveMessage() ใช้ได้แล้ว TO:B2 TO:C2' -PostId 'F09-A1-done-1' | Out-String
    Assert-BoardTest ($dup -match 'Sites: already posted id=1' -and $dup -match 'Already posted' -and $script:sitesPosts.Count -eq 1 -and $script:postCalls -eq $postCallsBefore) 'retry with the same PostId duplicates neither Sites nor GitHub'

    $ghBefore = $script:ghGetEndpoints.Count
    $readB2 = Invoke-TeamBoard -Mode Read @s -AgentId B2 | Out-String
    $lastGet = @($script:sitesCalls | Where-Object { $_.Method -eq 'GET' })[-1].Uri
    Assert-BoardTest ($readB2 -match 'POST 1 \[A1\] DONE' -and $readB2 -match 'ใช้ได้แล้ว' -and $lastGet -match 'after=0' -and $lastGet -match 'to=B2') 'BOARD_SOURCE=sites reads GET /api/posts?after=<id>&to=<lane>'
    $readB2Again = Invoke-TeamBoard -Mode Read @s -AgentId B2 | Out-String
    $lastGet = @($script:sitesCalls | Where-Object { $_.Method -eq 'GET' })[-1].Uri
    Assert-BoardTest ($readB2Again -match 'No new posts' -and $lastGet -match 'after=1' -and $script:ghGetEndpoints.Count -eq $ghBefore) 'Sites read pointer advances and GitHub is not polled while Sites works'

    $script:sitesDown = $true
    $r = Invoke-Captured { Invoke-TeamBoard -Mode Post @s -AgentId A1 -Text 'NEED TO:B2 ขอ getProduct() ของจริง' -PostId 'F08-need-1' }
    $outbox = Join-Path $s.StateRoot 'sites-outbox'
    $queued = @()
    if (Test-Path -LiteralPath $outbox) { $queued = @(Get-ChildItem -LiteralPath $outbox -Filter '*.json') }
    Assert-BoardTest ($null -eq $r.Failure -and $r.Out -match 'Posted:' -and $r.Out -match 'Sites: FAILED') 'Sites write failure still mirrors to GitHub without failing the caller'
    Assert-BoardTest ($r.Err -match 'WARNING: Sites write failed' -and $queued.Count -eq 1) 'Sites write failure prints a warning and queues the write'
    Assert-BoardTest ((Test-NoToken $r.Err) -and $r.Err -match '\[REDACTED\]' -and (Test-NoToken ([IO.File]::ReadAllText($queued[0].FullName)))) 'tokens are redacted from warnings and never stored in the outbox'

    $r = Invoke-Captured { Invoke-TeamBoard -Mode Read @s -AgentId B2 }
    Assert-BoardTest ($r.Err -match 'Sites read failed; falling back to GitHub' -and $r.Out -match 'COMMENT' -and $r.Out -match 'getProduct') 'Sites read failure falls back to GitHub automatically'
    Assert-BoardTest (-not ($r.Out -match 'merged abc1234')) 'fallback does not replay posts already delivered from Sites'
    Assert-BoardTest ((Test-NoToken $r.Err) -and (Test-NoToken $r.Out)) 'fallback warning prints no token'

    $script:sitesDown = $false
    $r = Invoke-Captured { Invoke-TeamBoard -Mode Post @s -AgentId A1 -Text 'CHANGE TO:B2 getProduct() ควรคืน stock ด้วย' -PostId 'F08-change-1' }
    Assert-BoardTest ($script:sitesPosts.Count -eq 3 -and $script:sitesPosts[1].post_key -eq 'A1:F08-need-1' -and $script:sitesPosts[2].post_key -eq 'A1:F08-change-1') 'queued Sites write is delivered first on the next run'
    Assert-BoardTest (@(Get-ChildItem -LiteralPath $outbox -Filter '*.json').Count -eq 0 -and $r.Err -match 'received 1 queued') 'outbox is emptied after recovery'
    $readBack = Invoke-TeamBoard -Mode Read @s -AgentId B2 | Out-String
    Assert-BoardTest ($readBack -match 'stock' -and -not ($readBack -match 'getProduct\(\) ของจริง')) 'back on Sites, posts already read from GitHub are not repeated'

    [Environment]::SetEnvironmentVariable('BOARD_SOURCE', 'github')
    $sitesPostsBefore = Get-SitesCallCount 'POST' '/api/posts'
    Invoke-TeamBoard -Mode Post @s -AgentId B1 -Text 'DONE F07 knowledge-search merged def5678 TO:C2' -PostId 'F07-B1-done-1' | Out-Null
    Assert-BoardTest ((Get-SitesCallCount 'POST' '/api/posts') -eq $sitesPostsBefore + 1) 'BOARD_SOURCE=github still writes every post to Sites'
    $sitesGetsBefore = Get-SitesCallCount 'GET' '/api/posts'
    $readC2 = Invoke-TeamBoard -Mode Read @s -AgentId C2 | Out-String
    Assert-BoardTest ($readC2 -match 'COMMENT' -and $readC2 -match 'DONE F07' -and (Get-SitesCallCount 'GET' '/api/posts') -eq $sitesGetsBefore) 'BOARD_SOURCE=github forces GitHub reads'
    [Environment]::SetEnvironmentVariable('BOARD_SOURCE', $null)

    $statusOut = Invoke-TeamBoard Status A1 F11 S takeover ใช้ได้ @s | Out-String
    $card = $script:sitesLanes['A1']
    Assert-BoardTest ($statusOut -match 'Sites lane card: A1 F11 team P0 S' -and $card.person -eq 'A' -and $card.feature_id -eq 'F11' -and $card.slug -eq 'team' -and $card.tier -eq 'P0' -and $card.status -eq 'S' -and $card.note -eq 'takeover ใช้ได้' -and $card.blocked -eq $false) 'status PUTs the lane card with feature, slug, tier, status and Thai note'
    $statusPost = $script:sitesPosts[-1]
    Assert-BoardTest ($statusPost.type -eq 'STATUS' -and @($statusPost.to_lanes | Where-Object { $_ }).Count -eq 0 -and $script:comments[-1].body.StartsWith('[A1/Codex] STATUS A1 F11 S takeover ใช้ได้')) 'status also posts a STATUS line to Sites and GitHub'
    # A TO: tag inside a STATUS note must still not wake that lane.
    Invoke-TeamBoard -Mode Status @s -Arguments @('A1', 'F11', 'A', 'assign', 'still', 'fake', 'TO:B2') -Sha 'ABC1234' -Blocked | Out-Null
    Assert-BoardTest ($script:sitesLanes['A1'].blocked -eq $true -and $script:sitesLanes['A1'].sha -eq 'abc1234' -and $script:sitesLanes['A1'].note -eq 'assign still fake TO:B2') 'status supports -Blocked and -Sha'
    Assert-BoardTest (@($script:sitesPosts[-1].to_lanes | Where-Object { $_ }).Count -eq 0) 'STATUS lines address no lane even with a TO: tag'
    foreach ($bad in @(@('A1', 'F11', 'X', 'n'), @('A1', 'F19', 'S', 'n'), @('Z9', 'F11', 'S', 'n'))) {
        $failed = $false
        try { Invoke-TeamBoard -Mode Status @s -Arguments $bad | Out-Null } catch { $failed = $true }
        Assert-BoardTest $failed "status rejects invalid input $($bad -join ' ')"
    }
    $failed = $false
    try { Invoke-TeamBoard -Mode Status @s -AgentId B2 -Arguments @('A1', 'F11', 'S', 'n') | Out-Null } catch { $failed = $_.Exception.Message -match 'own lane' }
    Assert-BoardTest $failed 'a lane cannot update another lane card'

    $script:sleeps.Clear()
    $getsBefore = Get-SitesCallCount 'GET' 'to=B2'
    $waitOut = Invoke-TeamBoard -Mode Wait @s -AgentId B2 -AsHookJson -DurationSeconds 100 | Out-String
    Assert-BoardTest ([string]::IsNullOrWhiteSpace($waitOut)) 'STATUS posts never wake a waiting lane (no hook JSON)'
    Assert-BoardTest ((Get-SitesCallCount 'GET' 'to=B2') - $getsBefore -eq 4 -and @($script:sleeps | Where-Object { $_ -lt 30 }).Count -eq 0) 'wait polls at most once per 30 s'
    $githubQuiet = Invoke-TeamBoard -Mode Read @s -AgentId B2 -Source github | Out-String
    Assert-BoardTest ($githubQuiet -match 'No new posts') 'GitHub path also ignores STATUS lines and posts for other lanes'
    $script:sleeps.Clear()
    $getsBefore = Get-SitesCallCount 'GET' 'to=B2'
    Invoke-TeamBoard -Mode Wait @s -AgentId B2 -AsHookJson -DurationSeconds 40 | Out-Null
    Assert-BoardTest ($script:sleeps[0] -eq 30 -and (Get-SitesCallCount 'GET' 'to=B2') - $getsBefore -eq 1) 'a second wait process for the same lane respects the 30 s limit'

    Invoke-TeamBoard -Mode Post @s -AgentId LEAD -Text 'LEAD: BUDGET A 18% · B 22% · C 25%' -PostId 'budget-1130' | Out-Null
    Invoke-TeamBoard -Mode Post @s -AgentId LEAD -Text 'LEAD: OPEN P1 checkpoint ผ่าน' -PostId 'open-p1' | Out-Null
    Assert-BoardTest ($script:sitesPosts[-2].type -eq 'LEAD: BUDGET' -and @($script:sitesPosts[-2].to_lanes | Where-Object { $_ }).Count -eq 0 -and @($script:sitesPosts[-1].to_lanes).Count -eq 12 -and $script:comments[-1].body.StartsWith('[LEAD] LEAD: OPEN')) 'LEAD posts: BUDGET addresses nobody, OPEN addresses all 12 lanes'
    $hook = (Invoke-TeamBoard -Mode Wait @s -AgentId B2 -AsHookJson -DurationSeconds 100 | Out-String).Trim()
    $decision = $hook | ConvertFrom-Json
    Assert-BoardTest ($decision.decision -eq 'block' -and $decision.reason -match 'LEAD: OPEN P1 checkpoint ผ่าน' -and -not ($decision.reason -match 'BUDGET')) 'wait -AsHookJson wakes the Stop hook with one JSON line for LEAD: OPEN'

    $script:sitesHtml = $true
    $r = Invoke-Captured { Invoke-TeamBoard -Mode Read @s -AgentId C2 }
    $script:sitesHtml = $false
    Assert-BoardTest ($r.Err -match 'non-JSON' -and $null -eq $r.Failure) 'a sign-in page instead of JSON (bad bypass token) falls back to GitHub'

    $script:sitesDown = $true
    $downCheck = Invoke-TeamBoard -Mode Check @s -AgentId C1 | Out-String
    $script:sitesDown = $false
    Assert-BoardTest ($downCheck -match 'Sites: FAILED' -and $downCheck -match '\[REDACTED\]' -and (Test-NoToken $downCheck)) 'Check redacts tokens from Sites errors'

    # ===== Part 3: orchestrators A0 B0 C0, TASK, FIX, DONE FIX, STAGE, wake rules, DEPLOY FREEZE =====
    [Environment]::SetEnvironmentVariable('BOARD_SOURCE', $null)
    $o = @{ Repo = 'team/competition'; Issue = 3; StateRoot = (Join-Path $scratch 'state-orch'); SecretsFile = $none }
    function Get-LastSitesPost { return $script:sitesPosts[$script:sitesPosts.Count - 1] }
    function Read-As([string]$Lane, [switch]$Frozen, [string]$Src = '') {
        $extra = @{}
        if ($Src) { $extra.Source = $Src }
        return (Invoke-TeamBoard -Mode Read @o -AgentId $Lane -Frozen:$Frozen @extra | Out-String)
    }
    foreach ($lane in @('A0', 'B0', 'C0')) { [void](Read-As $lane) }   # drain: later reads show only what this part posts

    $r = Invoke-Captured { Invoke-TeamBoard -Mode Post @o -AgentId A0 -Text 'TASK TO:A2 F14 slice 1 payment request + QR (spec §14)' -PostId 'task-a2-1' }
    $p = Get-LastSitesPost
    Assert-BoardTest ($null -eq $r.Failure -and $r.Out -match 'Sites: posted' -and $p.lane -eq 'A0' -and $p.type -eq 'TASK' -and (@($p.to_lanes) -join ',') -eq 'A2' -and $script:comments[-1].body.StartsWith('[A0/Codex] TASK TO:A2')) 'orchestrator A0 can post TASK TO:<lane> to Sites and GitHub as [A0/Codex]'
    Assert-BoardTest ((Read-As 'A2') -match 'TASK TO:A2 F14' -and (Read-As 'A1') -notmatch 'TASK' -and (Read-As 'B0') -notmatch 'TASK') 'TASK wakes the addressed worker only'
    $r = Invoke-Captured { Invoke-TeamBoard -Mode Post @o -AgentId A0 -Text 'TASK F14 slice 1 without a target' -PostId 'task-bad-1' }
    Assert-BoardTest ($r.Err -match 'TASK has no TO:' -and @((Get-LastSitesPost).to_lanes | Where-Object { $_ }).Count -eq 0) 'TASK without TO:<lane> warns and wakes nobody'

    # FIX TO:<lane> from a worker: owner and the author's orchestrator wake
    Invoke-TeamBoard -Mode Post @o -AgentId A2 -Text 'FIX TO:B1 catalog/service.ts getPrice returns null for lowercase sku' -PostId 'fix-b1-1' | Out-Null
    $p = Get-LastSitesPost
    Assert-BoardTest ($p.type -eq 'FIX' -and ((@($p.to_lanes) | Sort-Object) -join ',') -eq 'A0,B1') 'worker FIX TO:B1 is addressed to B1 and to the author orchestrator A0'
    Assert-BoardTest ((Read-As 'B1') -match 'FIX TO:B1' -and (Read-As 'A0') -match 'FIX TO:B1' -and (Read-As 'B0') -notmatch 'FIX TO:B1') 'FIX TO:<lane> wakes the owner and the author orchestrator, not the other orchestrator'

    # FIX <owner-lane> ... and DONE FIX from an orchestrator
    Invoke-TeamBoard -Mode Post @o -AgentId A0 -Text 'FIX B1 server/src/features/catalog/service.ts sku case breaks gate step 3' -PostId 'fix-announce-1' | Out-Null
    $p = Get-LastSitesPost
    Assert-BoardTest ($p.type -eq 'FIX' -and (@($p.to_lanes) -join ',') -eq 'B1') 'FIX <owner-lane> <file> <reason> addresses the lane right after FIX'
    Assert-BoardTest ((Read-As 'B1') -match 'FIX B1 server/src' -and (Read-As 'B2') -notmatch 'FIX B1') 'the owner is woken by an orchestrator FIX announcement (and can object)'
    Invoke-TeamBoard -Mode Post @o -AgentId A0 -Text 'DONE FIX B1 catalog-sku-case a1b2c3d fixed with test' -PostId 'donefix-1' | Out-Null
    $p = Get-LastSitesPost
    Assert-BoardTest ($p.type -eq 'DONE FIX' -and (@($p.to_lanes) -join ',') -eq 'B1' -and $p.sha -eq 'a1b2c3d') 'DONE FIX <owner-lane> <slug> <sha> is typed DONE FIX, addressed to the owner and carries the sha'
    Assert-BoardTest ((Read-As 'B1') -match 'DONE FIX B1 catalog-sku-case') 'DONE FIX wakes the owner lane'

    # orchestrator wake rules for worker reports (no TO: needed)
    Invoke-TeamBoard -Mode Post @o -AgentId A1 -Text 'DONE F09 inbox merged abc1234 saveMessage() ใช้ได้แล้ว' -PostId 'a1-done-1' | Out-Null
    Assert-BoardTest ((@((Get-LastSitesPost).to_lanes) -join ',') -eq 'A0') 'a worker DONE without TO: is addressed to its own orchestrator'
    Invoke-TeamBoard -Mode Post @o -AgentId B2 -Text 'NEED TO:C1 ขอ library pdf-parse' -PostId 'b2-need-1' | Out-Null
    Invoke-TeamBoard -Mode Post @o -AgentId C3 -Text 'BLOCKED @lead Google OAuth consent screen' -PostId 'c3-blocked-1' | Out-Null
    Invoke-TeamBoard -Mode Post @o -AgentId B3 -Text 'CHANGE TO:A1 saveMessage() ควรคืน messageId' -PostId 'b3-change-1' | Out-Null
    Invoke-TeamBoard -Mode Post @o -AgentId A3 -Text 'STATUS A3 F24 S crm list works' -PostId 'a3-status-1' | Out-Null
    $a0 = Read-As 'A0'; $b0 = Read-As 'B0'; $c0 = Read-As 'C0'
    Assert-BoardTest ($a0 -match 'DONE F09' -and $a0 -notmatch 'NEED TO:C1' -and $a0 -notmatch 'BLOCKED @lead' -and $a0 -notmatch 'STATUS A3') 'A0 is woken by A1 DONE but not by other persons workers nor by STATUS'
    Assert-BoardTest ($b0 -match 'NEED TO:C1' -and $b0 -match 'CHANGE TO:A1' -and $b0 -notmatch 'DONE F09') 'B0 is woken by its workers NEED and CHANGE'
    Assert-BoardTest ($c0 -match 'BLOCKED @lead' -and $c0 -notmatch 'NEED TO:C1') 'C0 is woken by its worker BLOCKED even with an @login target and not by a NEED aimed at C1'
    Assert-BoardTest ((Read-As 'C1') -match 'NEED TO:C1' -and (Read-As 'A1') -match 'CHANGE TO:A1') 'the TO: lane of a NEED / CHANGE is still woken'

    # GATE posts: C0 posts, all orchestrators wake, the TO: lane wakes
    foreach ($lane in @('A0', 'B0', 'C0', 'B2', 'A1')) { [void](Read-As $lane) }
    Invoke-TeamBoard -Mode Post @o -AgentId C0 -Text 'BLOCKED GATE core-loop step 3 TO:B2' -PostId 'gate-b-1' | Out-Null
    Assert-BoardTest (((@((Get-LastSitesPost).to_lanes)) | Sort-Object) -join ',' -eq 'A0,B0,B2,C0' -and (Get-LastSitesPost).type -eq 'BLOCKED GATE') 'BLOCKED GATE is addressed to the three orchestrators and the TO: lane'
    Assert-BoardTest ((Read-As 'A0') -match 'BLOCKED GATE' -and (Read-As 'B0') -match 'BLOCKED GATE' -and (Read-As 'B2') -match 'BLOCKED GATE' -and (Read-As 'A1') -notmatch 'GATE') 'GATE results wake every orchestrator and the tagged lane only'
    $r = Invoke-Captured { Invoke-TeamBoard -Mode Post @o -AgentId C1 -Text 'DONE GATE core-loop abc1234' -PostId 'gate-c1' }
    Assert-BoardTest ($r.Err -match 'normally posted by C0' -and $null -eq $r.Failure) 'DONE GATE from a lane other than C0 posts with a warning only'
    Invoke-TeamBoard -Mode Post @o -AgentId C0 -Text 'DONE GATE core-loop abc1234' -PostId 'gate-c0' | Out-Null
    Assert-BoardTest ((Get-LastSitesPost).type -eq 'DONE GATE' -and (Get-LastSitesPost).sha -eq 'abc1234' -and (Read-As 'A0') -match 'DONE GATE') 'DONE GATE from C0 carries the sha and wakes the orchestrators'

    # broadcast and quiet types
    Invoke-TeamBoard -Mode Post @o -AgentId C1 -Text 'SETUP READY 1a2b3c4d' -PostId 'setup-1' | Out-Null
    Assert-BoardTest (@((Get-LastSitesPost).to_lanes).Count -eq 12 -and (Get-LastSitesPost).type -eq 'SETUP READY') 'SETUP READY addresses all 12 lanes'
    Invoke-TeamBoard -Mode Post @o -AgentId LEAD -Text 'DEPLOY FREEZE no more merges to main until the demo' -PostId 'deploy-freeze-1' | Out-Null
    $p = Get-LastSitesPost
    Assert-BoardTest ($p.type -eq 'DEPLOY FREEZE' -and @($p.to_lanes).Count -eq 12 -and $script:comments[-1].body.StartsWith('[LEAD] DEPLOY FREEZE')) 'DEPLOY FREEZE wakes all 12 lanes like LEAD: FREEZE'
    Assert-BoardTest ((Read-As 'A0') -match 'DEPLOY FREEZE' -and (Read-As 'B3') -match 'DEPLOY FREEZE') 'DEPLOY FREEZE reaches orchestrators and workers'
    Invoke-TeamBoard -Mode Post @o -AgentId LEAD -Text 'LEAD: PAPI-REF OPEN เปิดอ่าน papi-ref TO:A1' -PostId 'papi-1' | Out-Null
    Assert-BoardTest ((Get-LastSitesPost).type -eq 'LEAD: PAPI-REF OPEN' -and @((Get-LastSitesPost).to_lanes | Where-Object { $_ }).Count -eq 0 -and (Read-As 'A1') -notmatch 'PAPI-REF') 'LEAD: PAPI-REF OPEN is quiet'

    # status: orchestrator lane and "-" feature
    $statusOut = Invoke-TeamBoard Status A0 none U 'orchestrator พร้อม' @o | Out-String
    $card = $script:sitesLanes['A0']
    Assert-BoardTest ($statusOut -match 'Sites lane card: A0' -and $card.person -eq 'A' -and $null -eq $card.feature_id -and $card.status -eq 'U' -and $card.note -eq 'orchestrator พร้อม') 'status A0 none U (or a bare -) puts an orchestrator card without a feature; the STATUS line shows -'
    Assert-BoardTest ((Get-LastSitesPost).type -eq 'STATUS' -and (Get-LastSitesPost).text -eq 'STATUS A0 - U orchestrator พร้อม' -and @((Get-LastSitesPost).to_lanes | Where-Object { $_ }).Count -eq 0) 'orchestrator STATUS line is quiet'
    $r = Invoke-Captured { Invoke-TeamBoard -Mode Status @o -Arguments @('B0', 'F10', 'A', 'ตรวจ F10 บน main') -AgentId B0 }
    Assert-BoardTest ($null -eq $r.Failure -and $r.Err -notmatch 'owned by' -and $script:sitesLanes['B0'].feature_id -eq 'F10') 'an orchestrator card may name any feature without an owner warning'
    $failed = $false
    try { Invoke-TeamBoard -Mode Status @o -AgentId A1 -Arguments @('A0', '-', 'U', 'x') | Out-Null } catch { $failed = $_.Exception.Message -match 'own lane' }
    Assert-BoardTest $failed 'a worker cannot update the orchestrator card'

    Invoke-TeamBoard Status B0 - S 'dash form' @o | Out-Null
    Assert-BoardTest ($null -eq $script:sitesLanes['B0'].feature_id -and (Get-LastSitesPost).text -eq 'STATUS B0 - S dash form') 'a bare - is accepted in-process as no feature'

    # stage mode
    $ostate = Join-Path $o.StateRoot 'last-stage.txt'
    $stageOut = Invoke-TeamBoard Stage A 'Done F09 - doing F11 takeover, F13 propose - blocked - - next F14 - usage 18%' @o -AgentId A0 | Out-String
    $p = Get-LastSitesPost
    Assert-BoardTest ($stageOut -match 'Sites person card: A updated' -and $p.type -eq 'STAGE' -and $p.lane -eq 'A0' -and $p.text -eq 'STAGE A Done F09 - doing F11 takeover, F13 propose - blocked - - next F14 - usage 18%' -and @($p.to_lanes | Where-Object { $_ }).Count -eq 0) 'stage A posts a quiet STAGE line from A0'
    $putCall = @($script:sitesCalls | Where-Object { $_.Method -eq 'PUT' -and $_.Uri -match '/api/people/A$' })[-1]
    $putBody = $putCall.Body | ConvertFrom-Json
    Assert-BoardTest ($putBody.person -eq 'A' -and $putBody.lane -eq 'A0' -and $putBody.summary -match 'doing F11 takeover' -and $script:sitesPeople['A'].summary -eq $putBody.summary) 'stage upserts the person card with PUT /api/people/A {person, summary, lane}'
    Assert-BoardTest ($script:comments[-1].body.StartsWith('[A0/Codex] STAGE A Done F09') -and [IO.File]::Exists($ostate)) 'STAGE is mirrored to GitHub and the local last-stage marker is written'
    [void](Read-As 'B0')
    $quiet = (Invoke-TeamBoard -Mode Wait @o -AgentId B0 -AsHookJson -DurationSeconds 40 | Out-String)
    Assert-BoardTest ([string]::IsNullOrWhiteSpace($quiet) -and (Read-As 'C2') -notmatch 'STAGE' -and (Read-As 'A1') -notmatch 'STAGE') 'STAGE never wakes anyone'
    Invoke-TeamBoard Stage B 'B summary from the lead' @o -AgentId LEAD | Out-Null
    Assert-BoardTest ($script:sitesPeople['B'].lane -eq 'LEAD' -and (Get-LastSitesPost).type -eq 'STAGE') 'LEAD may post a STAGE for any person'
    foreach ($case in @(@('A1', 'A'), @('B0', 'A'), @('A0', 'X'), @('A0', 'B'))) {
        $failed = $false
        try { Invoke-TeamBoard Stage $case[1] 'x' @o -AgentId $case[0] | Out-Null } catch { $failed = $_.Exception.Message -match 'may not post STAGE|Usage' }
        Assert-BoardTest $failed "stage $($case[1]) is refused for AgentId $($case[0])"
    }
    $failed = $false
    try { Invoke-TeamBoard Stage A ('x' * 401) @o -AgentId A0 | Out-Null } catch { $failed = $_.Exception.Message -match '401 characters' }
    Assert-BoardTest $failed 'stage refuses a summary over 400 characters'
    $failed = $false
    try { Invoke-TeamBoard Stage A @o -AgentId A0 | Out-Null } catch { $failed = $true }
    Assert-BoardTest $failed 'stage refuses an empty summary'
    $peopleCheck = Invoke-TeamBoard -Mode Check @o -AgentId C0 | Out-String
    Assert-BoardTest ($peopleCheck -match 'Sites people cards: OK \(2\)') 'check reports the people cards'
    $script:sitesDown = $true
    $r = Invoke-Captured { Invoke-TeamBoard Stage C 'Sites is down' @o -AgentId C0 }
    $script:sitesDown = $false
    Assert-BoardTest ($null -eq $r.Failure -and $r.Out -match 'Sites person card: FAILED' -and (Test-Path (Join-Path $o.StateRoot 'sites-outbox\person-C.json'))) 'a person card write that fails is queued and the STAGE still reaches GitHub'
    Invoke-TeamBoard Stage C 'Sites is back' @o -AgentId C0 | Out-Null
    Assert-BoardTest ($script:sitesPeople['C'].summary -eq 'Sites is back' -and -not (Test-Path (Join-Path $o.StateRoot 'sites-outbox\person-C.json'))) 'the queued person card is replaced by the next one'

    # frozen (after LEAD: FREEZE): workers wake only for TASK / FIX / GATE / DEPLOY FREEZE, orchestrators keep their worker reports
    foreach ($lane in @('A0', 'B1', 'B0')) { [void](Read-As $lane) }
    Invoke-TeamBoard -Mode Post @o -AgentId C1 -Text 'NEED TO:B1 something old' -PostId 'fz-need' | Out-Null
    Invoke-TeamBoard -Mode Post @o -AgentId LEAD -Text 'LEAD: OPEN P3 late tier' -PostId 'fz-open' | Out-Null
    Invoke-TeamBoard -Mode Post @o -AgentId B0 -Text 'TASK TO:B1 F37 fix the failing eval' -PostId 'fz-task' | Out-Null
    $frozenB1 = Read-As 'B1' -Frozen
    Assert-BoardTest ($frozenB1 -match 'TASK TO:B1 F37' -and $frozenB1 -notmatch 'something old' -and $frozenB1 -notmatch 'LEAD: OPEN') 'frozen worker wakes for TASK but not for NEED or LEAD: OPEN'
    Invoke-TeamBoard -Mode Post @o -AgentId A2 -Text 'DONE F13 orders merged fedcba9' -PostId 'fz-done-a2' | Out-Null
    Invoke-TeamBoard -Mode Post @o -AgentId A3 -Text 'FIX TO:A1 inbox/routes.ts 500 on empty body' -PostId 'fz-fix-a3' | Out-Null
    $frozenA0 = Read-As 'A0' -Frozen
    Assert-BoardTest ($frozenA0 -match 'DONE F13' -and $frozenA0 -match 'FIX TO:A1' -and $frozenA0 -notmatch 'LEAD: OPEN') 'frozen orchestrator still wakes for its workers reports and FIX but not for new tiers'
    $script:sleeps.Clear()
    Invoke-TeamBoard -Mode Post @o -AgentId A2 -Text 'FIX TO:A1 inbox/service.ts second case' -PostId 'fz-fix-a2' | Out-Null
    $hookFrozen = (Invoke-TeamBoard -Mode Wait @o -AgentId A1 -AsHookJson -Frozen -DurationSeconds 60 | Out-String).Trim()
    Assert-BoardTest ((($hookFrozen | ConvertFrom-Json).reason) -match 'FIX TO:A1' -and (($hookFrozen | ConvertFrom-Json).reason) -notmatch 'LEAD: OPEN') 'wait -Frozen -AsHookJson wakes a worker for a FIX'

    # GitHub read path: the orchestrator rule works from the [<lane>/Codex] prefix
    [Environment]::SetEnvironmentVariable('BOARD_SOURCE', 'github')
    $script:comments += @((New-TestComment 900 'peer' '[B1/Codex] DONE F05 knowledge merged 7777777'), (New-TestComment 901 'peer' '[A1/Codex] DONE F09 something else'), (New-TestComment 902 'peer' '[A0/Codex] STAGE A all fine'), (New-TestComment 903 'peer' '[B0/Codex] FIX C2 server/src/features/line/service.ts timeout'))
    $ghB0 = Read-As 'B0'
    $ghC2 = Read-As 'C2'
    [Environment]::SetEnvironmentVariable('BOARD_SOURCE', $null)
    Assert-BoardTest ($ghB0 -match 'DONE F05 knowledge' -and $ghB0 -notmatch 'DONE F09 something else' -and $ghB0 -notmatch 'STAGE A') 'GitHub fallback wakes B0 for B1 DONE only, STAGE stays quiet'
    Assert-BoardTest ($ghC2 -match 'FIX C2 server/src' -and $ghC2 -notmatch 'STAGE A') 'GitHub fallback wakes the owner addressed by FIX <lane> without TO:'

    # ===== Part 4: Codex hooks (stub board, real hook scripts in child powershell processes) =====
    $hookSource = Join-Path $PSScriptRoot '..\templates\codex\hooks'
    # The older hook tests below expect a quiet wait to end silently, so heartbeats are off until the heartbeat block.
    [Environment]::SetEnvironmentVariable('BOARD_STOP_HEARTBEATS', '0')
    function New-HookRepo([string]$Name, [string]$Lane) {
        $dir = Join-Path $scratch $Name
        [void][IO.Directory]::CreateDirectory((Join-Path $dir '.git'))
        [void][IO.Directory]::CreateDirectory((Join-Path $dir 'tools'))
        [void][IO.Directory]::CreateDirectory((Join-Path $dir '.codex'))
        Copy-Item -LiteralPath $hookSource -Destination (Join-Path $dir '.codex\hooks') -Recurse
        [IO.File]::WriteAllText((Join-Path $dir '.lane'), $Lane)
        [IO.File]::WriteAllText((Join-Path $dir 'tools\team-board.ps1'), @'
param([Parameter(Position = 0)][string]$Mode, [string]$AgentId, [int]$DurationSeconds, [switch]$AsHookJson, [switch]$Frozen)
New-Item -ItemType Directory -Force .team-board | Out-Null
Add-Content -LiteralPath .team-board\calls.txt -Value ("$Mode agent=$AgentId frozen=$($Frozen.IsPresent) dur=$DurationSeconds")
if ($Mode -eq 'Wait' -and (Test-Path .team-board\stub-wake.txt)) { Get-Content -LiteralPath .team-board\stub-wake.txt -Raw; Remove-Item .team-board\stub-wake.txt }
if ($Mode -eq 'Read') { 'No new posts.' }
'@, [Text.UTF8Encoding]::new($false))
        return $dir
    }
    function Invoke-HookScript([string]$Dir, [string]$Script, [string]$InputJson = '{"stop_hook_active":false}') {
        $psi = New-Object Diagnostics.ProcessStartInfo
        $psi.FileName = 'powershell.exe'
        $psi.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $Dir ".codex\hooks\$Script") + '"'
        $psi.WorkingDirectory = $Dir
        $psi.UseShellExecute = $false
        $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
        $psi.StandardOutputEncoding = [Text.Encoding]::UTF8
        $proc = [Diagnostics.Process]::Start($psi)
        $proc.StandardInput.Write($InputJson); $proc.StandardInput.Close()
        $out = $proc.StandardOutput.ReadToEnd()
        $err = $proc.StandardError.ReadToEnd()
        $proc.WaitForExit()
        return ($out + $err)
    }
    function Get-HookCalls([string]$Dir) {
        $f = Join-Path $Dir '.team-board\calls.txt'
        if (-not (Test-Path -LiteralPath $f)) { return '' }
        return ([IO.File]::ReadAllText($f))
    }
    function Set-HookTime([string]$Dir, [string]$Name, [double]$MinutesAgo) {
        [void][IO.Directory]::CreateDirectory((Join-Path $Dir '.team-board'))
        [IO.File]::WriteAllText((Join-Path $Dir ".team-board\$Name"), [DateTime]::UtcNow.AddMinutes(-$MinutesAgo).ToString('o'))
    }

    # A chat that asks for a person (a line that starts with the red stop sign) must end its turn at once: no board wait.
    $hn = New-HookRepo 'hook-human' 'B2'
    $out = Invoke-HookScript $hn 'stop.ps1' '{"stop_hook_active":false,"last_assistant_message":"Committed WIP on lane/B2/ai-agent.\n\n\ud83d\uded1 need a person: the OpenAI key is rejected (401)"}'
    Assert-BoardTest ([string]::IsNullOrWhiteSpace($out) -and (Get-HookCalls $hn) -notmatch 'Wait') 'Stop hook ends the turn at once when the last message asks for a person (the app can notify)'
    $out = Invoke-HookScript $hn 'stop.ps1' '{"stop_hook_active":false,"last_assistant_message":"> **NEEDS-HUMAN:** approve the Meta test user"}'
    Assert-BoardTest ([string]::IsNullOrWhiteSpace($out) -and (Get-HookCalls $hn) -notmatch 'Wait') 'the ASCII marker NEEDS-HUMAN at the start of a line works too'
    $out = Invoke-HookScript $hn 'stop.ps1' '{"stop_hook_active":false,"last_assistant_message":"F10 slice 2 merged. No \ud83d\uded1 blockers; nobody needs a human here."}'
    Assert-BoardTest ((Get-HookCalls $hn) -match 'Wait agent=B2') 'a stop sign in the middle of a sentence does not end the board wait'

    # Heartbeat: a quiet wait window keeps the lane listening instead of leaving the chat deaf.
    [Environment]::SetEnvironmentVariable('BOARD_STOP_HEARTBEATS', '2')
    $hb = New-HookRepo 'hook-beat' 'A3'
    $out = Invoke-HookScript $hb 'stop.ps1'
    $beat = $null; try { $beat = $out.Trim() | ConvertFrom-Json } catch { }
    Assert-BoardTest ($null -ne $beat -and $beat.decision -eq 'block' -and $beat.reason -match 'heartbeat 1/2 for lane A3' -and $beat.reason -match 'single word waiting') 'a quiet wait window continues the chat with a heartbeat prompt'
    $out = Invoke-HookScript $hb 'stop.ps1'
    Assert-BoardTest ($out -match 'heartbeat 2/2') 'the next quiet window counts up'
    $out = Invoke-HookScript $hb 'stop.ps1'
    Assert-BoardTest ([string]::IsNullOrWhiteSpace($out)) 'after the limit the hook lets the chat stop'
    [IO.File]::WriteAllText((Join-Path $hb '.team-board\stub-wake.txt'), ((ConvertTo-Json -InputObject @{ decision = 'block'; reason = "POST 3 [A0] TASK 2026`n[A0/Codex] TASK TO:A3 F24 slice 1" } -Compress)))
    $out = Invoke-HookScript $hb 'stop.ps1'
    Assert-BoardTest ($out -match 'TASK TO:A3' -and $out -notmatch 'heartbeat') 'a real post is passed through unchanged'
    $out = Invoke-HookScript $hb 'stop.ps1'
    Assert-BoardTest ($out -match 'heartbeat 1/2') 'a real post starts the heartbeat count over'
    [void](Invoke-HookScript $hb 'stop.ps1')
    [void](Invoke-HookScript $hb 'user-prompt.ps1')
    $out = Invoke-HookScript $hb 'stop.ps1'
    Assert-BoardTest ($out -match 'heartbeat 1/2') 'a human prompt starts the heartbeat count over'
    $out = Invoke-HookScript $hb 'stop.ps1' '{"stop_hook_active":true,"last_assistant_message":"\ud83d\uded1 need a person"}'
    Assert-BoardTest ([string]::IsNullOrWhiteSpace($out)) 'a chat that asks for a person is never kept alive by a heartbeat'
    [Environment]::SetEnvironmentVariable('BOARD_STOP_HEARTBEATS', $null)
    $out = Invoke-HookScript (New-HookRepo 'hook-beat-w' 'C3') 'stop.ps1'
    $outOrch = Invoke-HookScript (New-HookRepo 'hook-beat-o' 'B0') 'stop.ps1'
    Assert-BoardTest ($out -match 'heartbeat 1/8 for lane C3' -and $outOrch -match 'heartbeat 1/60 for lane B0') 'default limits: 8 quiet windows for a worker, 60 for an orchestrator'
    [Environment]::SetEnvironmentVariable('BOARD_STOP_HEARTBEATS', '0')

    $h = New-HookRepo 'hook-a0' 'A0'
    $out = Invoke-HookScript $h 'stop.ps1'
    Assert-BoardTest ([string]::IsNullOrWhiteSpace($out) -and (Get-HookCalls $h) -match 'Wait agent=A0 frozen=False' -and (Get-HookCalls $h) -match 'dur=(?:[1-9]|[1-9]\d|[1-5]\d\d)\b' -and [IO.File]::Exists((Join-Path $h '.team-board\orch-start.txt'))) 'Stop hook accepts lane A0, waits on the board and starts the STAGE clock; nothing printed when no post'
    Set-HookTime $h 'last-stage.txt' 31
    $out = Invoke-HookScript $h 'stop.ps1'
    $decision = $null; try { $decision = $out.Trim() | ConvertFrom-Json } catch { }
    Assert-BoardTest ($null -ne $decision -and $decision.decision -eq 'block' -and $decision.reason -match 'STAGE due' -and $decision.reason -match 'stage A ' -and $decision.reason -match '31 minutes') 'Stop hook wakes an orchestrator 30+ minutes after its last STAGE'
    Assert-BoardTest ([IO.File]::Exists((Join-Path $h '.team-board\stage-reminded.txt'))) 'the reminder is recorded'
    $callsBefore = (Get-HookCalls $h)
    $out = Invoke-HookScript $h 'stop.ps1'
    Assert-BoardTest ([string]::IsNullOrWhiteSpace($out) -and (Get-HookCalls $h).Length -gt $callsBefore.Length) 'no second STAGE reminder within 10 minutes (the hook waits on the board instead)'
    Set-HookTime $h 'last-stage.txt' 29.8
    Remove-Item (Join-Path $h '.team-board\stage-reminded.txt') -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $h '.team-board\calls.txt') -ErrorAction SilentlyContinue
    [void](Invoke-HookScript $h 'stop.ps1')
    Assert-BoardTest ((Get-HookCalls $h) -match 'dur=(?:[1-9]|[1-3]\d)\r?\n') 'the board wait is cut short so it ends when the STAGE is due'
    Set-HookTime $h 'last-stage.txt' 5
    [IO.File]::WriteAllText((Join-Path $h '.team-board\stub-wake.txt'), ((ConvertTo-Json -InputObject @{ decision = 'block'; reason = "POST 7 [B1] DONE 2026`n[B1/Codex] DONE F05 knowledge merged abc1234" } -Compress)))
    Remove-Item (Join-Path $h '.team-board\stage-reminded.txt') -ErrorAction SilentlyContinue
    $out = Invoke-HookScript $h 'stop.ps1'
    $decision = $out.Trim() | ConvertFrom-Json
    Assert-BoardTest ($decision.reason -match 'DONE F05 knowledge' -and $decision.reason -notmatch 'STAGE due') 'a board wake is passed through and carries no STAGE reminder while the STAGE is not due'

    $h = New-HookRepo 'hook-b2' 'B2'
    Set-HookTime $h 'last-stage.txt' 240
    $out = Invoke-HookScript $h 'stop.ps1'
    Assert-BoardTest ([string]::IsNullOrWhiteSpace($out) -and (Get-HookCalls $h) -match 'Wait agent=B2') 'a worker lane never gets a STAGE reminder'
    [IO.File]::WriteAllText((Join-Path $h '.team-board\stub-wake.txt'), ((ConvertTo-Json -InputObject @{ decision = 'block'; reason = "POST 9 [LEAD] LEAD: FREEZE 2026`n[LEAD] LEAD: FREEZE stop features" } -Compress)))
    $out = Invoke-HookScript $h 'stop.ps1'
    $decision = $out.Trim() | ConvertFrom-Json
    Assert-BoardTest ($decision.reason -match 'LEAD: FREEZE received' -and [IO.File]::Exists((Join-Path $h '.team-board\hook-freeze.txt'))) 'LEAD: FREEZE wakes once and is remembered'
    Remove-Item (Join-Path $h '.team-board\calls.txt')
    $out = Invoke-HookScript $h 'stop.ps1'
    Assert-BoardTest ([string]::IsNullOrWhiteSpace($out) -and (Get-HookCalls $h) -match 'Wait agent=B2 frozen=True') 'after FREEZE the Stop hook still waits but asks the board with -Frozen'
    [IO.File]::WriteAllText((Join-Path $h '.team-board\stub-wake.txt'), ((ConvertTo-Json -InputObject @{ decision = 'block'; reason = "POST 11 [LEAD] DEPLOY FREEZE 2026`n[LEAD] DEPLOY FREEZE no merges" } -Compress)))
    $out = Invoke-HookScript $h 'stop.ps1'
    $decision = $out.Trim() | ConvertFrom-Json
    Assert-BoardTest ($decision.reason -match 'DEPLOY FREEZE: do not merge or push to main') 'DEPLOY FREEZE wakes with a no-merge note'
    $out = Invoke-HookScript $h 'session-start.ps1'
    Assert-BoardTest ($out -match 'lane B2, no new posts') 'SessionStart still works after FREEZE'

    $h = New-HookRepo 'hook-c0' 'C0'
    $out = Invoke-HookScript $h 'session-start.ps1'
    Assert-BoardTest ($out -match 'lane C0' -and [IO.File]::Exists((Join-Path $h '.team-board\orch-start.txt'))) 'SessionStart accepts lane C0 and starts the orchestrator STAGE clock'
    $h = New-HookRepo 'hook-bad' 'A4'
    $out = Invoke-HookScript $h 'stop.ps1'
    Assert-BoardTest ($out -match 'A0..C3' -and -not (Test-Path (Join-Path $h '.team-board\calls.txt'))) 'a .lane outside A0..C3 keeps the hooks silent with one warning'

    $secrets = Join-Path $scratch 'nless.secrets.env'
    [IO.File]::WriteAllText($secrets, "# test`nSITES_URL=https://board.example.invalid`nSITES_BYPASS_TOKEN=`"$script:testBypass`"`nBOARD_SECRET=$script:testSecret`nBOARD_SOURCE=sites`nBOARD_REPO=team/competition`nBOARD_ISSUE=2`nOPENAI_API_KEY=sk-not-for-the-board`n", [Text.UTF8Encoding]::new($false))
    foreach ($key in @('SITES_URL', 'SITES_BYPASS_TOKEN', 'BOARD_SECRET')) { [Environment]::SetEnvironmentVariable($key, $null) }
    [Environment]::SetEnvironmentVariable('BOARD_SOURCE', 'github')
    $loadedConfig = Get-BoardConfig -SecretsFile $secrets
    Assert-BoardTest ($loadedConfig.SITES_BYPASS_TOKEN -eq $script:testBypass -and $loadedConfig.BOARD_ISSUE -eq '2' -and -not $loadedConfig.ContainsKey('OPENAI_API_KEY')) 'secrets file supplies only board settings'
    Assert-BoardTest ($loadedConfig.BOARD_SOURCE -eq 'github') 'environment overrides the secrets file'
    [Environment]::SetEnvironmentVariable('BOARD_SOURCE', $null)
    $laneDirectory = Join-Path $scratch 'worktree-c2'
    [void][IO.Directory]::CreateDirectory($laneDirectory)
    [IO.File]::WriteAllText((Join-Path $laneDirectory '.lane'), "c2`n")
    Push-Location $laneDirectory
    try { $fromFile = Invoke-TeamBoard -Mode Check -SecretsFile $secrets -StateRoot $s.StateRoot | Out-String }
    finally { Pop-Location }
    Assert-BoardTest ($fromFile -match 'Agent: C2' -and $fromFile -match 'Sites: OK' -and $fromFile -match 'board/2') 'Repo, Issue and Sites settings come from the secrets file and the lane from .lane'

    # ===== Human alerts: a post that needs a person alerts the person =====
    foreach ($key in $script:BoardConfigKeys) { [Environment]::SetEnvironmentVariable($key, $null) }
    [Environment]::SetEnvironmentVariable('BOARD_TEAM_LOGINS', 'tester,peer')
    $script:comments = @()
    $a = @{ Repo = 'team/competition'; Issue = 2; StateRoot = (Join-Path $scratch 'state-alert'); SecretsFile = $none }
    $script:alertCalls.Clear()
    Invoke-TeamBoard -Mode Post @a -AgentId B2 -Text 'DONE F10 ai-agent merged abc1234 TO:A1' -PostId 'alert-done' | Out-Null
    Invoke-TeamBoard -Mode Post @a -AgentId B2 -Text 'NEED TO:C1 ask owner.a@example.test fixture for the smoke test' -PostId 'alert-need-lane' | Out-Null
    Assert-BoardTest ($script:alertCalls.Count -eq 0) 'DONE and lane-to-lane NEED posts (and e-mail addresses in text) do not alert a person'
    Invoke-TeamBoard -Mode Post @a -AgentId B2 -Text 'BLOCKED @peer F10 OpenAI key rejected (401)' -PostId 'alert-blocked' | Out-Null
    Assert-BoardTest ($script:alertCalls.Count -eq 1 -and $script:alertCalls[0].Agent -eq 'B2' -and $script:alertCalls[0].Level -eq 'blocked' -and $script:alertCalls[0].Message -match '^\[B2/Codex\] BLOCKED @peer') 'a BLOCKED post alerts the person at the posting PC, with the lane prefix'
    Invoke-TeamBoard -Mode Post @a -AgentId C0 -Text 'BLOCKED GATE core-loop step 3 TO:B2' -PostId 'alert-gate' | Out-Null
    Invoke-TeamBoard -Mode Post @a -AgentId A1 -Text 'NEED @tester approve the Meta test user' -PostId 'alert-mention' | Out-Null
    Assert-BoardTest ($script:alertCalls.Count -eq 3) 'BLOCKED GATE and an @login mention alert too'
    $script:failGet = $true
    $script:alertCalls.Clear()
    $failedPost = $false
    try { Invoke-TeamBoard -Mode Post @a -AgentId B2 -Text 'BLOCKED @peer board is down' -PostId 'alert-board-down' | Out-Null } catch { $failedPost = $true }
    $script:failGet = $false
    Assert-BoardTest ($failedPost -and $script:alertCalls.Count -eq 1) 'the alert fires before the network calls, so a board failure cannot hide a blocker'
    $script:alertCalls.Clear()
    Invoke-TeamBoard -Mode Watch @a -AgentId LEAD -DurationSeconds 1 -PollSeconds 10 | Out-Null
    $watchBlocked = @($script:alertCalls | Where-Object { $_.Message -match 'BLOCKED' })
    $watchMention = @($script:alertCalls | Where-Object { $_.Message -match 'NEED @tester' })
    Assert-BoardTest ($watchBlocked.Count -eq 2 -and $watchMention.Count -eq 1) 'the human watcher alerts on BLOCKED posts and on posts that mention this login'
    Assert-BoardTest (@($script:alertCalls | Where-Object { $_.Message -match 'DONE F10|NEED TO:C1' }).Count -eq 0) 'the human watcher stays quiet for ordinary posts'
    Assert-BoardTest ((Test-BoardHumanAlert -Text 'STATUS B2 F10 S mail owner.a@example.test' -Type 'STATUS') -eq $false -and (Test-BoardHumanAlert -Text 'DONE F10 thanks @RathaTart' -Type 'DONE') -eq $true -and (Test-BoardHumanAlert -Text 'NEED @peerless x' -Type 'NEED' -Login 'peer') -eq $false) 'mention detection ignores e-mail addresses and partial login matches'
}
finally {
    foreach ($key in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key]) }
    [Environment]::SetEnvironmentVariable('BOARD_STOP_HEARTBEATS', $null)
}

Write-Output "PASS: $script:assertions offline board assertions. No network or real messages."
Write-Output "Disposable test state retained at: $scratch"
