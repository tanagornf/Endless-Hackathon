# Original team coordination helper. No application implementation is included.
# Board = private ChatGPT Sites dashboard (D1) + pinned GitHub issue mirror. Reading posts never executes them.
# Requires Windows PowerShell 5.1+ and GitHub CLI (gh). Every write goes to Sites AND GitHub; reads use
# BOARD_SOURCE=sites (default, automatic GitHub fallback on any error) or BOARD_SOURCE=github.
#
#   team-board.ps1 check                                   identity, board issue and Sites health (writes nothing)
#   team-board.ps1 post -MessageFile handoff\<id>.txt -PostId <id>     (or -Text "...")
#   team-board.ps1 status <lane> <feature|none> <R|S|A|U> <note> [-Sha <sha>] [-Blocked]   (lane A0..C3; "none" = no feature, for orchestrators;
#                                                            a bare "-" is also accepted but PowerShell -File cannot pass it)
#   team-board.ps1 stage <A|B|C> "<summary <= 400 chars>"  orchestrator (A0/B0/C0) or LEAD: STAGE post + person card (PUT /api/people/<P>)
#   team-board.ps1 read                                    new posts for this lane (SessionStart / UserPromptSubmit)
#   team-board.ps1 wait -AsHookJson [-Frozen]              Stop hook: waits (default 540 s), prints one JSON line only when woken
#   team-board.ps1 watch                                   human terminal view of every post (separate cursor)
#                                                          it also alerts the person (sound + toast) on BLOCKED posts and on posts that @mention them
#
# Lanes: workers A1..C3, orchestrators A0 B0 C0, and LEAD (human). Wake rules: see Get-BoardToLanes / Test-BoardRelevant.
# Repo/Issue/AgentId default to BOARD_REPO, BOARD_ISSUE and the .lane file in the current folder.
# Settings come from the environment, else ..\nless.secrets.env: SITES_URL, SITES_BYPASS_TOKEN, BOARD_SECRET,
# BOARD_SOURCE, BOARD_REPO, BOARD_ISSUE, BOARD_TEAM_LOGINS (comma-separated GitHub logins). Tokens are never printed.
# Human alerts: a BLOCKED post, or any post that @mentions a person, also runs alert.ps1 from this folder (beeps and a Windows
# toast on this PC). The ChatGPT app's own notifications (desktop and paired phone) fire when the chat ends its turn or asks a
# question; this is the local backup. BOARD_ALERT=0 switches it off.
[CmdletBinding()]
param(
    [Parameter(Position = 0)][ValidateSet('Check', 'Read', 'Post', 'Watch', 'Wait', 'Status', 'Stage')][string]$Mode = 'Check',
    [Parameter(Position = 1, ValueFromRemainingArguments = $true)][string[]]$Arguments = @(),
    [string]$Repo = '',
    [int]$Issue = 0,
    [string]$AgentId = '',
    [string]$MessageFile = '',
    [string]$Text = '',
    [string]$PostId = '',
    [string]$Sha = '',
    [switch]$Blocked,
    [string]$StateRoot = '.team-board',
    [string]$SecretsFile = '',
    [string]$Source = '',
    [ValidateRange(10, 300)][int]$PollSeconds = 30,
    [ValidateRange(1, 3600)][int]$DurationSeconds = 1800,
    [switch]$AsHookJson,
    [switch]$Frozen
)

$script:BoardScriptRoot = $PSScriptRoot
$script:BoardWorkerLanes = @('A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3')
$script:BoardOrchLanes = @('A0', 'B0', 'C0')
$script:BoardLanes = @('A0', 'A1', 'A2', 'A3', 'B0', 'B1', 'B2', 'B3', 'C0', 'C1', 'C2', 'C3')
# Posts that wake every lane (workers and orchestrators), with or without a TO: tag.
$script:BoardWakeTypes = @('SETUP READY', 'LEAD: OPEN', 'LEAD: FREEZE', 'DEPLOY FREEZE')
# Posts that wake the three orchestrators (the lane tagged TO: also wakes).
$script:BoardGateTypes = @('DONE GATE', 'BLOCKED GATE')
# Worker posts that wake the worker's own orchestrator (<P>1..3 -> <P>0) even without a TO: tag.
$script:BoardReportTypes = @('DONE', 'BLOCKED', 'NEED', 'FIX', 'CHANGE')
# After LEAD: FREEZE (-Frozen) a worker is woken only by these; orchestrators keep every wake except new-tier posts.
$script:BoardFrozenTypes = @('TASK', 'FIX', 'DONE FIX', 'DONE GATE', 'BLOCKED GATE', 'DEPLOY FREEZE', 'LEAD: FREEZE')
$script:BoardQuietTypes = @('STATUS', 'STAGE', 'LEAD: BUDGET', 'LEAD: PAPI-REF OPEN')
$script:BoardStageLimit = 400
$script:BoardConfigKeys = @('SITES_URL', 'SITES_BYPASS_TOKEN', 'BOARD_SECRET', 'BOARD_SOURCE', 'BOARD_REPO', 'BOARD_ISSUE', 'BOARD_TEAM_LOGINS')
$script:BoardThrottleSeconds = 30
$script:BoardTextLimit = 2000
# Feature -> owner lane | slug | tier (PLAN.md lanes, feature-backlog.csv slugs). Retired IDs are rejected on purpose.
$script:BoardFeatures = @{
    F01 = 'C1|core|P0'; F35 = 'C1|core/jobs|P0'; F36 = 'C1|release|P1'
    F17 = 'C2|line|P0'; F18 = 'C2|meta|P1'; F21 = 'C2|comments|P2'
    F04 = 'C3|business-settings|P0'; F03 = 'C3|tenancy|P0'; F02 = 'C3|auth|P1'; F31 = 'C3|notifications|P1'
    F05 = 'B1|knowledge|P0'; F07 = 'B1|knowledge-search|P0'; F08 = 'B1|catalog|P0'
    F10 = 'B2|ai-agent|P0'; F30 = 'B2|voice|P3'
    F06 = 'B3|knowledge-import|P1'; F26 = 'B3|insights|P2'; F27 = 'B3|analytics|P2'
    F09 = 'A1|inbox|P0'; F11 = 'A1|team|P0'; F12 = 'A1|message-templates|P2'; F23 = 'A1|broadcast|P2'
    F13 = 'A2|orders|P1'; F14 = 'A2|payments|P1'; F22 = 'A2|live-commerce|P2'
    F24 = 'A3|crm|P1'; F15 = 'A3|booking|P2'; F16 = 'A3|calendar|P2'
}

# ---------- small helpers ----------

function Get-BoardUtcNow { return [DateTime]::UtcNow }

function Write-BoardWarning {
    param([string]$Message)
    # stderr keeps stdout clean for hooks (Write-Warning goes to stdout under powershell.exe redirection).
    [Console]::Error.WriteLine("WARNING: $Message")
}

function Get-BoardHash {
    param([string]$Value)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value)))).Replace('-', '').ToLowerInvariant().Substring(0, 20) }
    finally { $sha.Dispose() }
}

function Resolve-BoardPath {
    param([string]$Path)
    if ([IO.Path]::IsPathRooted($Path)) { return [IO.Path]::GetFullPath($Path) }
    return [IO.Path]::GetFullPath((Join-Path (Get-Location -PSProvider FileSystem).ProviderPath $Path))
}

function Hide-BoardSecret {
    param([string]$Value, [hashtable]$Config)
    $result = [string]$Value
    if ($null -ne $Config) {
        foreach ($key in @('SITES_BYPASS_TOKEN', 'BOARD_SECRET')) {
            $secret = [string]$Config[$key]
            if ($secret.Length -ge 4) { $result = $result.Replace($secret, '[REDACTED]') }
        }
    }
    return [regex]::Replace($result, '(?i)(bearer\s+)(?!\[REDACTED\])[^\s"'',;]+', '${1}[REDACTED]')
}

function Get-BoardPrefix {
    param([string]$Agent)
    if ($Agent -eq 'LEAD') { return '[LEAD]' }
    return "[$Agent/Codex]"
}

function Test-BoardSitesAuthor {
    param([string]$Agent)
    return ($Agent -cmatch '^(?:[ABC][0-3]|LEAD)$')
}

function Test-BoardOrchestrator {
    param([string]$Agent)
    return ($Agent -cmatch '^[ABC]0$')
}

function Get-BoardBody {
    # The post text without a leading "[<author>/Codex] " prefix.
    param([string]$Text)
    $body = ([string]$Text).TrimStart()
    $prefix = [regex]::Match($body, '^\[[A-Za-z0-9_-]{1,40}(?:/Codex)?\]\s*')
    if ($prefix.Success) { $body = $body.Substring($prefix.Length) }
    return $body
}

function Get-BoardAuthor {
    # The author lane from a mirrored "[A1/Codex] ..." prefix (GitHub reads); '' when there is none.
    param([string]$Text)
    $match = [regex]::Match(([string]$Text).TrimStart(), '^\[([A-Za-z0-9_-]{1,40})(?:/Codex)?\]')
    if ($match.Success) { return $match.Groups[1].Value.ToUpperInvariant() }
    return ''
}

# ---------- configuration ----------

function Read-BoardSecretsFile {
    param([string]$Path)
    $values = @{}
    if ([string]::IsNullOrWhiteSpace($Path) -or -not [IO.File]::Exists($Path)) { return $values }
    foreach ($line in [IO.File]::ReadAllLines($Path, [Text.Encoding]::UTF8)) {
        $entry = $line.Trim()
        if ($entry.Length -eq 0 -or $entry.StartsWith('#')) { continue }
        if ($entry.StartsWith('export ')) { $entry = $entry.Substring(7).TrimStart() }
        $equals = $entry.IndexOf('=')
        if ($equals -lt 1) { continue }
        $name = $entry.Substring(0, $equals).Trim()
        $value = $entry.Substring($equals + 1).Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) { $value = $value.Substring(1, $value.Length - 2) }
        $values[$name] = $value
    }
    return $values
}

function Get-BoardConfig {
    param([string]$SecretsFile = '')
    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($SecretsFile)) { $candidates = @(Resolve-BoardPath $SecretsFile) }
    else {
        $candidates = @(Resolve-BoardPath '..\nless.secrets.env')
        if (-not [string]::IsNullOrWhiteSpace($script:BoardScriptRoot)) { $candidates += [IO.Path]::GetFullPath((Join-Path $script:BoardScriptRoot '..\..\nless.secrets.env')) }
    }
    $fileValues = @{}
    $loaded = ''
    foreach ($candidate in $candidates) {
        if ([IO.File]::Exists($candidate)) { $fileValues = Read-BoardSecretsFile -Path $candidate; $loaded = $candidate; break }
    }
    $config = @{ SecretsFileLoaded = $loaded }
    foreach ($key in $script:BoardConfigKeys) {
        # The environment wins over the file so one shell can override a setting (e.g. BOARD_SOURCE=github).
        $value = [Environment]::GetEnvironmentVariable($key)
        if ([string]::IsNullOrWhiteSpace($value) -and $fileValues.ContainsKey($key)) { $value = $fileValues[$key] }
        if ($null -eq $value) { $value = '' }
        $config[$key] = ([string]$value).Trim()
    }
    return $config
}

# ---------- post classification ----------

function Get-BoardPostType {
    param([string]$Text)
    $body = Get-BoardBody $Text
    $patterns = [ordered]@{
        'DONE FIX' = '^DONE\s+FIX\b'; 'DONE GATE' = '^DONE GATE\b'; 'BLOCKED GATE' = '^BLOCKED GATE\b'; 'SETUP READY' = '^SETUP READY\b'
        'LEAD: OPEN' = '^LEAD:\s*OPEN\b'; 'LEAD: BUDGET' = '^LEAD:\s*BUDGET\b'; 'LEAD: FREEZE' = '^LEAD:\s*FREEZE\b'
        'LEAD: PAPI-REF OPEN' = '^LEAD:\s*PAPI-REF\s+OPEN\b'; 'DEPLOY FREEZE' = '^DEPLOY\s+FREEZE\b'
        'STATUS' = '^STATUS\b'; 'STAGE' = '^STAGE\b'; 'TASK' = '^TASK\b'; 'FIX' = '^FIX\b'
        'DONE' = '^DONE\b'; 'NEED' = '^NEED\b'; 'CHANGE' = '^CHANGE\b'; 'BLOCKED' = '^BLOCKED\b'
    }
    foreach ($entry in $patterns.GetEnumerator()) { if ($body -cmatch $entry.Value) { return $entry.Key } }
    return 'NOTE'
}

function Get-BoardToLanes {
    # Who a post is addressed to (stored as to_lanes on Sites; the Sites read filter is "to=<lane>").
    #  - STATUS, STAGE, LEAD: BUDGET, LEAD: PAPI-REF OPEN: nobody (quiet).
    #  - SETUP READY, LEAD: OPEN, LEAD: FREEZE, DEPLOY FREEZE: all 12 lanes.
    #  - every other post: each TO:<lane> tag; for FIX / DONE FIX also the lane right after the type ("FIX B1 file reason").
    #  - DONE GATE / BLOCKED GATE: also the three orchestrators.
    #  - DONE, BLOCKED, NEED, FIX, CHANGE written by a worker <P>1..3: also its orchestrator <P>0, with or without TO:.
    param([string]$Text, [string]$Type, [string]$Author = '')
    if ($script:BoardQuietTypes -contains $Type) { return @() }
    if ($script:BoardWakeTypes -contains $Type) { return $script:BoardLanes }
    $found = @()
    foreach ($match in [regex]::Matches([string]$Text, '(?i)\bTO:([ABC][0-3])\b')) {
        $lane = $match.Groups[1].Value.ToUpperInvariant()
        if ($found -notcontains $lane) { $found += $lane }
    }
    if ($Type -eq 'FIX' -or $Type -eq 'DONE FIX') {
        $owner = [regex]::Match((Get-BoardBody $Text), '(?i)^(?:DONE\s+)?FIX\s+([ABC][0-3])\b')
        if ($owner.Success) {
            $lane = $owner.Groups[1].Value.ToUpperInvariant()
            if ($found -notcontains $lane) { $found += $lane }
        }
    }
    if ($script:BoardGateTypes -contains $Type) {
        foreach ($lane in $script:BoardOrchLanes) { if ($found -notcontains $lane) { $found += $lane } }
    }
    if ($script:BoardReportTypes -contains $Type) {
        $worker = [regex]::Match([string]$Author, '^([ABC])[1-3]$')
        if ($worker.Success) {
            $lane = $worker.Groups[1].Value + '0'
            if ($found -notcontains $lane) { $found += $lane }
        }
    }
    return $found
}

function ConvertTo-BoardLaneList {
    param($Value, [string]$Text, [string]$Type, [string]$Author = '')
    $raw = $Value
    if ($raw -is [string]) {
        $trimmed = $raw.Trim()
        if ($trimmed.StartsWith('[')) { try { $raw = ConvertFrom-Json -InputObject $trimmed } catch { $raw = $null } }
        else { $raw = $trimmed.Split(',') }
    }
    if ($null -eq $raw) { return @(Get-BoardToLanes -Text $Text -Type $Type -Author $Author) }
    $lanes = @()
    foreach ($entry in @($raw)) {
        $lane = ([string]$entry).Trim().ToUpperInvariant()
        if ($lane.Length -gt 0) { $lanes += $lane }
    }
    return $lanes
}

function Test-BoardRelevant {
    param([string]$Type, [string[]]$ToLanes, [string]$Text, [string]$Agent, [bool]$Frozen = $false)
    # STATUS, STAGE, LEAD: BUDGET and LEAD: PAPI-REF OPEN never wake a lane.
    if ($script:BoardQuietTypes -contains $Type) { return $false }
    if ($Frozen) {
        # After LEAD: FREEZE nobody starts a new feature; workers wake only for TASK / FIX / GATE / DEPLOY FREEZE posts.
        if (@('SETUP READY', 'LEAD: OPEN') -contains $Type) { return $false }
        if (-not (Test-BoardOrchestrator $Agent) -and ($script:BoardFrozenTypes -notcontains $Type)) { return $false }
    }
    if ($script:BoardWakeTypes -contains $Type) { return $true }
    if (@($ToLanes) -contains $Agent) { return $true }
    return ([string]$Text -match ('(?i)\bTO:' + [regex]::Escape($Agent) + '\b'))
}

function Get-BoardShaFromText {
    param([string]$Text, [string]$Type)
    if (@('DONE', 'SETUP READY', 'DONE GATE', 'DONE FIX') -notcontains $Type) { return $null }
    if ($Type -eq 'DONE FIX') {
        $fix = [regex]::Match((Get-BoardBody $Text), '(?i)^DONE\s+FIX\s+[ABC][0-3]\s+\S+\s+([0-9a-f]{7,40})\b')
        if ($fix.Success) { return $fix.Groups[1].Value.ToLowerInvariant() }
        return $null
    }
    $match = [regex]::Match([string]$Text, '(?i)\b(?:merged|ready|core-loop|sha)[:=\s]+([0-9a-f]{7,40})\b')
    if ($match.Success) { return $match.Groups[1].Value.ToLowerInvariant() }
    return $null
}

# ---------- local state (cursors, seen ledger, poll throttle) ----------

function Write-BoardJsonFile {
    param([string]$Path, $Value)
    $temporary = "$Path.$([guid]::NewGuid().ToString('N')).tmp"
    try {
        $json = ConvertTo-Json -InputObject $Value -Depth 6
        [IO.File]::WriteAllText($temporary, $json, [Text.UTF8Encoding]::new($false))
        if ([IO.File]::Exists($Path)) {
            # A real backup path avoids Windows PowerShell 5.1 converting null
            # into an invalid empty path when binding File.Replace's third argument.
            $backup = "$Path.previous"
            [IO.File]::Replace($temporary, $Path, $backup)
            if ([IO.File]::Exists($backup)) { [IO.File]::Delete($backup) }
        }
        else { [IO.File]::Move($temporary, $Path) }
    }
    finally { if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) } }
}

function Write-BoardCursor {
    param([string]$Path, [long]$LastId, [string]$LastCreatedAt = '')
    Write-BoardJsonFile -Path $Path -Value @{ lastId = $LastId; lastCreatedAt = $LastCreatedAt; savedAtUtc = (Get-BoardUtcNow).ToString('o') }
}

function Read-BoardCursor {
    param([string]$Path)
    $cursor = @{ lastId = [long]0; lastCreatedAt = '' }
    if (-not [IO.File]::Exists($Path)) { return $cursor }
    try {
        $saved = [IO.File]::ReadAllText($Path) | ConvertFrom-Json
        $cursor.lastId = [long]$saved.lastId
        if ($saved.PSObject.Properties.Name -contains 'lastCreatedAt') { $cursor.lastCreatedAt = ConvertTo-BoardIsoTime $saved.lastCreatedAt }
    }
    catch { throw 'Cursor is unreadable. Preserve it and choose a new AgentId to replay the inbox safely.' }
    return $cursor
}

function Read-BoardSeen {
    param([string]$Path)
    $seen = New-Object 'System.Collections.Generic.List[string]'
    if ([IO.File]::Exists($Path)) {
        # A damaged ledger only risks a replay, never a lost message, so it is not fatal.
        try { $parsed = [IO.File]::ReadAllText($Path) | ConvertFrom-Json; foreach ($key in $parsed) { if ($key) { $seen.Add([string]$key) } } } catch { }
    }
    return , $seen
}

function Save-BoardSeen {
    param([string]$Path, $Seen)
    $keep = @($Seen | Select-Object -Last 2000)
    Write-BoardJsonFile -Path $Path -Value $keep
}

function Lock-BoardFile {
    param([string]$Path, [string]$BusyMessage)
    try { return [IO.File]::Open($Path, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
    catch { if ($BusyMessage) { throw $BusyMessage }; return $null }
}

# ---------- GitHub ----------

function Invoke-BoardGhJson {
    param([string[]]$Arguments)
    $raw = @(& gh @Arguments)
    if ($LASTEXITCODE -ne 0) { throw "GitHub CLI failed; no cursor advanced. Check authentication/network and retry Read." }
    try { return (($raw -join "`n") | ConvertFrom-Json) }
    catch { throw 'GitHub CLI returned invalid JSON; no cursor advanced.' }
}

function Get-BoardComments {
    param([string]$BoardRepo, [int]$BoardIssue, [string]$Since = '')
    $endpoint = "repos/$BoardRepo/issues/$BoardIssue/comments?per_page=100"
    if (-not [string]::IsNullOrWhiteSpace($Since)) { $endpoint += "&since=$Since" }
    $pages = Invoke-BoardGhJson -Arguments @('api', '--method', 'GET', $endpoint, '--paginate', '--slurp')
    $comments = @()
    foreach ($page in @($pages)) {
        foreach ($comment in @($page)) {
            if ($null -ne $comment) { $comments += $comment }
        }
    }
    return @($comments | Sort-Object { [long]$_.id })
}

function Get-BoardLogin {
    param([hashtable]$Ctx)
    if (-not [string]::IsNullOrWhiteSpace($Ctx.Login)) { return $Ctx.Login }
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) is not on PATH.' }
    $identity = Invoke-BoardGhJson -Arguments @('api', 'user')
    $login = [string]$identity.login
    if ([string]::IsNullOrWhiteSpace($login)) { throw 'Cannot establish the authenticated GitHub user.' }
    $Ctx.Login = $login
    return $login
}

function Get-BoardGitHubCursorPath {
    param([hashtable]$Ctx, [switch]$Watch)
    $login = Get-BoardLogin $Ctx
    $name = 'cursor-' + (Get-BoardHash "$($Ctx.Repo)|$($Ctx.Issue)|$login|$($Ctx.AgentId)")
    if ($Watch) { $name += '-watch' }
    return (Join-Path $Ctx.StateDirectory "$name.json")
}

function ConvertTo-BoardIsoTime {
    param($Value)
    if ($Value -is [DateTime]) { return $Value.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }
    return [string]$Value
}

function Assert-GitHubBoardRoster {
    param([hashtable]$Ctx, $Repository)
    if ($Ctx.TeamLogins.Count -gt 0) { return }
    if ($null -eq $Repository) { $Repository = Invoke-BoardGhJson -Arguments @('api', "repos/$($Ctx.Repo)") }
    if ($Repository.private -ne $true) { throw 'Set BOARD_TEAM_LOGINS before reading a public GitHub message board.' }
}

function Get-GitHubInboxItems {
    param([hashtable]$Ctx, [long]$AfterId, [string]$LastCreatedAt, [switch]$AllPosts)
    Assert-GitHubBoardRoster -Ctx $Ctx
    $login = Get-BoardLogin $Ctx
    $since = ''
    if (-not [string]::IsNullOrWhiteSpace($LastCreatedAt)) {
        # Fetch only recent comments; the id filter below drops anything already read. The margin covers clock skew.
        try {
            $styles = [Globalization.DateTimeStyles]::AdjustToUniversal -bor [Globalization.DateTimeStyles]::AssumeUniversal
            $since = [DateTime]::Parse($LastCreatedAt, [Globalization.CultureInfo]::InvariantCulture, $styles).AddMinutes(-2).ToString('yyyy-MM-ddTHH:mm:ssZ')
        }
        catch { $since = '' }
    }
    $prefix = Get-BoardPrefix $Ctx.AgentId
    $items = @()
    foreach ($comment in @(Get-BoardComments -BoardRepo $Ctx.Repo -BoardIssue $Ctx.Issue -Since $since)) {
        $id = [long]$comment.id
        if ($id -le $AfterId) { continue }
        $body = [string]$comment.body
        $author = [string]$comment.user.login
        $marker = [regex]::Match($body, '<!-- team-board-post:([^:\s]+):([^:\s]+):([A-Za-z0-9_.:-]{1,100}) -->')
        $key = ''
        $display = $body
        if ($marker.Success) { $key = $marker.Groups[2].Value + ':' + $marker.Groups[3].Value; $display = $body.Replace($marker.Value, '').TrimEnd() }
        $own = ($author -eq $login) -and $body.StartsWith($prefix, [StringComparison]::Ordinal)
        $trusted = ($Ctx.TeamLogins.Count -eq 0) -or ($Ctx.TeamLogins -contains $author.ToLowerInvariant())
        $postType = Get-BoardPostType $body
        $postTo = [string[]]@(Get-BoardToLanes -Text $display -Type $postType -Author (Get-BoardAuthor $display))
        $relevant = $trusted -and ($AllPosts -or (Test-BoardRelevant -Type $postType -ToLanes $postTo -Text $body -Agent $Ctx.AgentId -Frozen ([bool]$Ctx.Frozen)))
        $attention = ''
        if ($body -match ('(?i)@' + [regex]::Escape($login) + '\b|\bTO:' + [regex]::Escape($Ctx.AgentId) + '\b')) { $attention = ' [MENTION]' }
        $items += [pscustomobject]@{
            Id = $id; CreatedAt = (ConvertTo-BoardIsoTime $comment.created_at); Key = $key; Own = $own; Relevant = $relevant
            Lines = @("COMMENT $id @$author$attention $($comment.html_url)", $display, '')
        }
    }
    return $items
}

# ---------- ChatGPT Sites ----------

function Get-BoardHttpStatus {
    param($ErrorRecord)
    $exception = $ErrorRecord.Exception
    try { if ($null -ne $exception.Response -and $null -ne $exception.Response.StatusCode) { return [int]$exception.Response.StatusCode } } catch { }
    $match = [regex]::Match([string]$exception.Message, '\((\d{3})\)')
    if ($match.Success) { return [int]$match.Groups[1].Value }
    return 0
}

function Test-SitesResponse {
    param($Response, [string]$Expect)
    if ($null -eq $Response) { return $false }
    $names = @($Response.PSObject.Properties.Name)
    switch ($Expect) {
        'post' { return (($names -contains 'post') -and ($null -ne $Response.post) -and ($null -ne $Response.post.id)) }
        'lane' { return (($names -contains 'lane') -and ($null -ne $Response.lane)) }
        'posts' { return (($names -contains 'posts') -or ($Response -is [array])) }
        'lanes' { return ($names -contains 'lanes') }
        'person' { return (($names -contains 'person') -and ($null -ne $Response.person)) }
        'people' { return ($names -contains 'people') }
    }
    return $true
}

function Invoke-SitesApi {
    param([hashtable]$Ctx, [string]$Method, [string]$Path, [string]$Json = '', [string]$Expect = '', [int]$TimeoutSec = 15)
    $config = $Ctx.Config
    $headers = @{ 'OAI-Sites-Authorization' = 'Bearer ' + $config.SITES_BYPASS_TOKEN; 'Authorization' = 'Bearer ' + $config.BOARD_SECRET }
    $outFile = Join-Path $Ctx.StateDirectory ('sites-' + [guid]::NewGuid().ToString('N') + '.tmp')
    # The body is read back from OutFile as UTF-8: Windows PowerShell 5.1 would otherwise decode a
    # response without a charset as ISO-8859-1 and break Thai text. No redirects: they could carry the token elsewhere.
    $request = @{ Uri = $config.SITES_URL.TrimEnd('/') + $Path; Method = $Method; Headers = $headers; TimeoutSec = $TimeoutSec; UseBasicParsing = $true; OutFile = $outFile; MaximumRedirection = 0 }
    if (-not [string]::IsNullOrEmpty($Json)) { $request.Body = [Text.Encoding]::UTF8.GetBytes($Json); $request.ContentType = 'application/json; charset=utf-8' }
    $ProgressPreference = 'SilentlyContinue'
    try {
        try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
        try { [void](Invoke-RestMethod @request) }
        catch {
            $status = Get-BoardHttpStatus -ErrorRecord $_
            $detail = [string]$_.Exception.Message
            if ($null -ne $_.ErrorDetails -and -not [string]::IsNullOrWhiteSpace($_.ErrorDetails.Message)) { $detail = "$detail $($_.ErrorDetails.Message)" }
            if ($detail.Length -gt 300) { $detail = $detail.Substring(0, 300) }
            $label = 'network error'
            if ($status -gt 0) { $label = "HTTP $status" }
            $failure = New-Object System.Exception (Hide-BoardSecret -Value "Sites $Method $($Path.Split('?')[0]) failed ($label): $detail" -Config $config)
            $failure.Data['SitesStatus'] = $status
            throw $failure
        }
        $parsed = $null
        if ([IO.File]::Exists($outFile)) {
            $raw = [IO.File]::ReadAllText($outFile, [Text.Encoding]::UTF8)
            if (-not [string]::IsNullOrWhiteSpace($raw)) { try { $parsed = ConvertFrom-Json -InputObject $raw } catch { $parsed = $null } }
        }
        if (-not [string]::IsNullOrEmpty($Expect) -and -not (Test-SitesResponse -Response $parsed -Expect $Expect)) {
            # Typical cause: a sign-in page or redirect instead of the API (bypass token wrong or route missing).
            $failure = New-Object System.Exception "Sites $Method $($Path.Split('?')[0]) returned an unexpected or non-JSON response."
            $failure.Data['SitesStatus'] = -1
            throw $failure
        }
        return , $parsed
    }
    finally { if ([IO.File]::Exists($outFile)) { [IO.File]::Delete($outFile) } }
}

function Get-SitesInboxItems {
    param([hashtable]$Ctx, [long]$AfterId, [switch]$AllPosts)
    $items = @()
    $after = $AfterId
    for ($page = 0; $page -lt 20; $page++) {
        $path = "/api/posts?after=$after&limit=50"
        if (-not $AllPosts) { $path += "&to=$($Ctx.AgentId)" }
        $response = Invoke-SitesApi -Ctx $Ctx -Method 'GET' -Path $path -Expect 'posts' -TimeoutSec 10
        $posts = @()
        if (@($response.PSObject.Properties.Name) -contains 'posts') { $posts = @($response.posts) } else { $posts = @($response) }
        foreach ($post in @($posts | Where-Object { $null -ne $_ } | Sort-Object { [long]$_.id })) {
            $id = [long]$post.id
            if ($id -le $after) { continue }
            $after = $id
            $lane = [string]$post.lane
            $text = [string]$post.text
            $type = [string]$post.type
            if ([string]::IsNullOrWhiteSpace($type)) { $type = Get-BoardPostType $text }
            $toLanes = [string[]]@(ConvertTo-BoardLaneList -Value $post.to_lanes -Text $text -Type $type -Author $lane)
            # Union with the local rules so a post stored by an older script still wakes the right lanes.
            foreach ($extra in @(Get-BoardToLanes -Text $text -Type $type -Author $lane)) { if ($toLanes -notcontains $extra) { $toLanes += $extra } }
            $relevant = $AllPosts -or (Test-BoardRelevant -Type $type -ToLanes $toLanes -Text $text -Agent $Ctx.AgentId -Frozen ([bool]$Ctx.Frozen))
            $items += [pscustomobject]@{
                Id = $id; CreatedAt = (ConvertTo-BoardIsoTime $post.created_at); Key = [string]$post.post_key; Own = ($lane -eq $Ctx.AgentId); Relevant = $relevant
                Lines = @("POST $id [$lane] $type $(ConvertTo-BoardIsoTime $post.created_at)", "$(Get-BoardPrefix $lane) $text", '')
            }
        }
        if ($posts.Count -lt 50) { break }
    }
    return $items
}

function Add-SitesOutbox {
    param([hashtable]$Ctx, [string]$Method, [string]$Path, [string]$Json, [string]$Name = '')
    $directory = Join-Path $Ctx.StateDirectory 'sites-outbox'
    [void][IO.Directory]::CreateDirectory($directory)
    if ([string]::IsNullOrWhiteSpace($Name)) { $Name = 'post-' + (Get-BoardUtcNow).Ticks.ToString('D20') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8) }
    Write-BoardJsonFile -Path (Join-Path $directory "$Name.json") -Value @{ method = $Method; path = $Path; json = $Json; queuedAtUtc = (Get-BoardUtcNow).ToString('o') }
}

function Send-SitesOutbox {
    param([hashtable]$Ctx)
    $directory = Join-Path $Ctx.StateDirectory 'sites-outbox'
    if (-not [IO.Directory]::Exists($directory)) { return }
    $files = @(Get-ChildItem -LiteralPath $directory -Filter '*.json' -File | Sort-Object Name)
    if ($files.Count -eq 0) { return }
    $lock = Lock-BoardFile -Path (Join-Path $Ctx.StateDirectory 'sites-outbox.lock') -BusyMessage ''
    if ($null -eq $lock) { return }
    try {
        $sent = 0
        foreach ($file in $files) {
            $rejected = Join-Path $directory 'rejected'
            try { $item = [IO.File]::ReadAllText($file.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json }
            catch { [void][IO.Directory]::CreateDirectory($rejected); [IO.File]::Move($file.FullName, (Join-Path $rejected $file.Name)); continue }
            $expect = 'post'
            if ([string]$item.method -eq 'PUT') { $expect = 'lane'; if ([string]$item.path -like '/api/people/*') { $expect = 'person' } }
            try {
                [void](Invoke-SitesApi -Ctx $Ctx -Method ([string]$item.method) -Path ([string]$item.path) -Json ([string]$item.json) -Expect $expect)
                [IO.File]::Delete($file.FullName)
                $sent++
            }
            catch {
                if (@(400, 404, 405, 413, 422) -contains [int]$_.Exception.Data['SitesStatus']) {
                    [void][IO.Directory]::CreateDirectory($rejected)
                    [IO.File]::Move($file.FullName, (Join-Path $rejected $file.Name))
                    Write-BoardWarning "Sites rejected a queued write; moved to sites-outbox\rejected. $($_.Exception.Message)"
                    continue
                }
                Write-BoardWarning "Sites still unavailable; queued Sites writes are kept for the next run. $($_.Exception.Message)"
                break
            }
        }
        if ($sent -gt 0) { [Console]::Error.WriteLine("NOTE: Sites received $sent queued write(s).") }
    }
    finally { $lock.Dispose() }
}

function Send-SitesWrite {
    param([hashtable]$Ctx, [string]$Method, [string]$Path, [string]$Json, [string]$Expect, [string]$QueueName = '')
    if (-not $Ctx.SitesReady) { return [pscustomobject]@{ Ok = $false; Response = $null; Note = "Sites: skipped ($($Ctx.SitesReason))" } }
    if (-not (Test-BoardSitesAuthor $Ctx.AgentId)) { return [pscustomobject]@{ Ok = $false; Response = $null; Note = "Sites: skipped (AgentId $($Ctx.AgentId) is not A0..C3 or LEAD)" } }
    Send-SitesOutbox -Ctx $Ctx
    try {
        $response = Invoke-SitesApi -Ctx $Ctx -Method $Method -Path $Path -Json $Json -Expect $Expect
        return [pscustomobject]@{ Ok = $true; Response = $response; Note = '' }
    }
    catch {
        $message = $_.Exception.Message
        if (@(400, 404, 405, 413, 422) -contains [int]$_.Exception.Data['SitesStatus']) {
            Write-BoardWarning "Sites rejected this write (not queued); GitHub still gets it. $message"
            return [pscustomobject]@{ Ok = $false; Response = $null; Note = 'Sites: rejected (see warning)' }
        }
        Add-SitesOutbox -Ctx $Ctx -Method $Method -Path $Path -Json $Json -Name $QueueName
        Write-BoardWarning "Sites write failed; GitHub still gets it and the Sites write is queued in .team-board\sites-outbox for the next run. $message"
        return [pscustomobject]@{ Ok = $false; Response = $null; Note = 'Sites: FAILED, queued for retry (see warning)' }
    }
}

# ---------- reading ----------

function Invoke-BoardRead {
    param([hashtable]$Ctx, [switch]$AllPosts, [switch]$AsHookJson, [switch]$Quiet, [ref]$Delivered)
    $suffix = ''
    if ($AllPosts) { $suffix = '-watch' }
    $inbox = Join-Path $Ctx.StateDirectory ('inbox-' + $Ctx.InboxKey + $suffix)
    $lock = Lock-BoardFile -Path "$inbox.lock" -BusyMessage 'Another reader owns this cursor. Stop the duplicate watcher or use a different AgentId.'
    try {
        $seenPath = Join-Path $Ctx.StateDirectory ('seen-' + $Ctx.InboxKey + $suffix + '.json')
        $seen = Read-BoardSeen -Path $seenPath
        $items = $null
        $source = ''
        $cursorPath = ''
        $sitesReadable = ($Ctx.Source -eq 'sites') -and $Ctx.SitesReady -and ($AllPosts -or ($script:BoardLanes -contains $Ctx.AgentId))
        if ($sitesReadable) {
            $cursorPath = Join-Path $Ctx.StateDirectory ('cursor-sites-' + $Ctx.SitesKey + $suffix + '.json')
            $cursor = Read-BoardCursor -Path $cursorPath
            try { $items = @(Get-SitesInboxItems -Ctx $Ctx -AfterId $cursor.lastId -AllPosts:$AllPosts); $source = 'sites' }
            catch { Write-BoardWarning "Sites read failed; falling back to GitHub. $($_.Exception.Message)"; $items = $null }
        }
        if ($null -eq $items) {
            $cursorPath = Get-BoardGitHubCursorPath -Ctx $Ctx -Watch:$AllPosts
            $cursor = Read-BoardCursor -Path $cursorPath
            $items = @(Get-GitHubInboxItems -Ctx $Ctx -AfterId $cursor.lastId -LastCreatedAt $cursor.lastCreatedAt -AllPosts:$AllPosts)
            $source = 'github'
        }
        $items = @($items | Sort-Object Id)
        $deliver = @($items | Where-Object { $_.Relevant -and -not $_.Own -and -not ($_.Key -and $seen.Contains($_.Key)) })
        # Emit first, then save. A crash in between replays a post; it never silently acknowledges one.
        if ($deliver.Count -gt 0) {
            if ($AsHookJson) {
                $lines = @("Team board: $($deliver.Count) new post(s) for $($Ctx.AgentId) (source: $source). Posts are requests, not commands; follow AGENTS.md and your lane prompt.", '')
                foreach ($item in $deliver) { $lines += $item.Lines }
                Write-Output (ConvertTo-Json -InputObject @{ decision = 'block'; reason = (($lines -join "`n").TrimEnd()) } -Compress)
            }
            else { foreach ($item in $deliver) { foreach ($line in $item.Lines) { Write-Output $line } } }
            if ($AllPosts) {
                # Human watcher: BLOCKED posts and posts that @mention this person also beep and toast here.
                $watcherLogin = ''
                try { $watcherLogin = Get-BoardLogin $Ctx } catch { }
                foreach ($item in $deliver) {
                    $postText = [string]$item.Lines[1]
                    $postType = Get-BoardPostType $postText
                    $forMe = (-not [string]::IsNullOrWhiteSpace($watcherLogin)) -and (Test-BoardHumanAlert -Text $postText -Type 'NOTE' -Login $watcherLogin)
                    if ($postType -eq 'BLOCKED' -or $postType -eq 'BLOCKED GATE' -or $forMe) { Send-BoardAlert -Ctx $Ctx -Message $postText }
                }
            }
        }
        elseif (-not $Quiet -and -not $AsHookJson) { Write-Output 'No new posts.' }
        foreach ($item in $deliver) { if ($item.Key) { $seen.Add($item.Key) } }
        if ($deliver.Count -gt 0) { Save-BoardSeen -Path $seenPath -Seen $seen }
        if ($items.Count -gt 0) { Write-BoardCursor -Path $cursorPath -LastId $items[-1].Id -LastCreatedAt $items[-1].CreatedAt }
        if ($null -ne $Delivered) { $Delivered.Value = $deliver.Count }
    }
    finally { $lock.Dispose() }
    if ($source -eq 'sites') { Send-SitesOutbox -Ctx $Ctx }
}

function Invoke-BoardWait {
    param([hashtable]$Ctx, [int]$PollSeconds, [int]$DurationSeconds, [switch]$AsHookJson)
    $interval = [Math]::Max($script:BoardThrottleSeconds, $PollSeconds)
    $deadline = (Get-BoardUtcNow).AddSeconds($DurationSeconds)
    $pollPath = Join-Path $Ctx.StateDirectory ('poll-' + $Ctx.InboxKey + '.json')
    $succeeded = $false
    $lastError = ''
    while ($true) {
        # At most one board read per 30 s per lane, shared by every wait process of this lane on this machine.
        $now = Get-BoardUtcNow
        if ([IO.File]::Exists($pollPath)) {
            try {
                $saved = ([IO.File]::ReadAllText($pollPath) | ConvertFrom-Json).lastPollUtc
                if ($saved -is [DateTime]) { $last = $saved.ToUniversalTime() }
                else { $last = [DateTime]::Parse([string]$saved, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime() }
                $gap = $script:BoardThrottleSeconds - ($now - $last).TotalSeconds
                if ($gap -gt 0) {
                    if ($now.AddSeconds($gap) -ge $deadline) { break }
                    Start-Sleep -Seconds ([int][Math]::Ceiling($gap))
                }
            }
            catch { }
        }
        Write-BoardJsonFile -Path $pollPath -Value @{ lastPollUtc = (Get-BoardUtcNow).ToString('o') }
        $count = 0
        try { Invoke-BoardRead -Ctx $Ctx -AsHookJson:$AsHookJson -Quiet -Delivered ([ref]$count); $succeeded = $true }
        catch {
            $message = Hide-BoardSecret -Value $_.Exception.Message -Config $Ctx.Config
            if ($message -ne $lastError) { Write-BoardWarning "Board read failed; still waiting. $message" }
            $lastError = $message
        }
        if ($count -gt 0) { return }
        if ((Get-BoardUtcNow).AddSeconds($interval) -ge $deadline) { break }
        Start-Sleep -Seconds $interval
    }
    if (-not $succeeded -and $lastError) { throw "Board wait could not read Sites or GitHub. $lastError" }
    if (-not $AsHookJson) { Write-Output 'No new posts before the wait timeout.' }
}

# ---------- human alerts ----------

function Test-BoardHumanAlert {
    # True when a post asks for a PERSON: a BLOCKED / BLOCKED GATE post, or an @login mention (TO:<lane> tags address agents, not people).
    param([string]$Text, [string]$Type, [string]$Login = '')
    if ($Type -eq 'BLOCKED' -or $Type -eq 'BLOCKED GATE') { return $true }
    $body = Get-BoardBody $Text
    if (-not [string]::IsNullOrWhiteSpace($Login)) { return ($body -match ('(?i)(?<![A-Za-z0-9._%+-])@' + [regex]::Escape($Login) + '(?![A-Za-z0-9-])')) }
    return ($body -match '(?<![A-Za-z0-9._%+-])@[A-Za-z0-9][A-Za-z0-9_-]{0,38}')
}

function Send-BoardAlert {
    # Tell the person at this PC through alert.ps1 beside this script (beeps and a Windows toast). Never throws, never blocks a post.
    param([hashtable]$Ctx, [string]$Message, [string]$Level = 'blocked')
    if ([Environment]::GetEnvironmentVariable('BOARD_ALERT') -eq '0') { return }
    if ([string]::IsNullOrWhiteSpace($script:BoardScriptRoot)) { return }
    try {
        $alert = Join-Path $script:BoardScriptRoot 'alert.ps1'
        if (-not [IO.File]::Exists($alert)) { return }
        $alertArgs = @{ Message = @($Message); Level = $Level; Lane = [string]$Ctx.AgentId }
        if (-not [string]::IsNullOrWhiteSpace([string]$Ctx.Config.SecretsFileLoaded)) { $alertArgs['SecretsFile'] = [string]$Ctx.Config.SecretsFileLoaded }
        $note = (& $alert @alertArgs | Out-String).Trim()
        if ($note) { [Console]::Error.WriteLine("NOTE: $note") }
    }
    catch { Write-BoardWarning "Human alert failed (the post itself is not affected). $($_.Exception.Message)" }
}

# ---------- writing ----------

function Invoke-BoardPost {
    param([hashtable]$Ctx, [string]$Message, [string]$PostId, [string]$Sha = '')
    if ($Message.Length -gt $script:BoardTextLimit) { throw 'Message is over 2,000 characters; send a concise handoff with links.' }
    if ([string]::IsNullOrWhiteSpace($PostId)) { $PostId = [guid]::NewGuid().ToString('N') }
    if ($PostId -notmatch '^[A-Za-z0-9_.:-]{1,100}$') { throw 'PostId must be a short stable delivery identifier, without spaces.' }
    $type = Get-BoardPostType -Text $Message
    $toLanes = [string[]]@(Get-BoardToLanes -Text $Message -Type $type -Author $Ctx.AgentId)
    if ($type -eq 'TASK' -and $toLanes.Count -eq 0) { Write-BoardWarning 'TASK has no TO:<lane>; nobody will be woken. Use: TASK TO:<lane> <ID> <what>.' }
    if (@('DONE GATE', 'BLOCKED GATE') -contains $type -and $Ctx.AgentId -ne 'C0' -and $Ctx.AgentId -ne 'LEAD') { Write-BoardWarning "$type is normally posted by C0 (the 13:00 gate owner); posting as $($Ctx.AgentId) anyway." }
    $postSha = $null
    if (-not [string]::IsNullOrWhiteSpace($Sha)) { $postSha = $Sha.ToLowerInvariant() } else { $postSha = Get-BoardShaFromText -Text $Message -Type $type }
    Write-Output "PostId: $PostId (reuse this value to reconcile an uncertain send)"
    # A post that needs a person alerts the person at this PC first, so a board or network failure below cannot hide it.
    if (Test-BoardHumanAlert -Text $Message -Type $type) { Send-BoardAlert -Ctx $Ctx -Message "$(Get-BoardPrefix $Ctx.AgentId) $Message" }

    $body = [ordered]@{ lane = $Ctx.AgentId; type = $type; to_lanes = $toLanes; text = $Message; sha = $postSha; post_key = "$($Ctx.AgentId):$PostId" }
    $sites = Send-SitesWrite -Ctx $Ctx -Method 'POST' -Path '/api/posts' -Json (ConvertTo-Json -InputObject $body -Depth 5 -Compress) -Expect 'post'
    $sitesNote = $sites.Note
    if ($sites.Ok) {
        $sitesNote = "Sites: posted id=$($sites.Response.post.id)"
        if ($sites.Response.duplicate -eq $true) { $sitesNote = "Sites: already posted id=$($sites.Response.post.id)" }
    }
    Write-Output $sitesNote
    # The Stop hook of an orchestrator reads this marker to wake it when its next STAGE is due (no network call).
    if ($type -eq 'STAGE' -and (Test-BoardOrchestrator $Ctx.AgentId)) {
        try { [IO.File]::WriteAllText((Join-Path $Ctx.StateDirectory 'last-stage.txt'), (Get-BoardUtcNow).ToString('o')) }
        catch { Write-BoardWarning "Could not record the STAGE time in .team-board. $($_.Exception.Message)" }
    }

    # GitHub mirror with the original duplicate guard (same login + AgentId + PostId marker).
    try {
        $login = Get-BoardLogin $Ctx
        $marker = "<!-- team-board-post:$login`:$($Ctx.AgentId)`:$PostId -->"
        $already = @(Get-BoardComments -BoardRepo $Ctx.Repo -BoardIssue $Ctx.Issue | Where-Object { ($_.user.login -eq $login) -and ([string]$_.body).Contains($marker) })
    }
    catch { throw "GitHub mirror not sent ($sitesNote). Retry with the same PostId '$PostId'. $($_.Exception.Message)" }
    if ($already.Count -gt 0) { Write-Output "Already posted: $($already[0].html_url)"; return }
    $payload = @{ body = "$(Get-BoardPrefix $Ctx.AgentId) $Message`n`n$marker" } | ConvertTo-Json -Depth 5
    $payloadPath = Join-Path $Ctx.StateDirectory "post-$([guid]::NewGuid().ToString('N')).json"
    try {
        [IO.File]::WriteAllText($payloadPath, $payload, [Text.UTF8Encoding]::new($false))
        $posted = Invoke-BoardGhJson -Arguments @('api', '--method', 'POST', "repos/$($Ctx.Repo)/issues/$($Ctx.Issue)/comments", '--input', $payloadPath)
        Write-Output "Posted: $($posted.html_url)"
    }
    catch { throw "Post outcome may be uncertain ($sitesNote). Read the issue and search PostId '$PostId' before sending again. $($_.Exception.Message)" }
    finally { if ([IO.File]::Exists($payloadPath)) { [IO.File]::Delete($payloadPath) } }
}

function Invoke-BoardStatus {
    param([hashtable]$Ctx, [string]$Lane, [string]$Feature, [string]$Code, [string]$Note, [string]$Sha, [bool]$IsBlocked, [string]$PostId)
    $Lane = ([string]$Lane).ToUpperInvariant()
    $Feature = ([string]$Feature).ToUpperInvariant()
    $Code = ([string]$Code).ToUpperInvariant()
    if ($script:BoardLanes -notcontains $Lane) { throw 'Status lane must be one of A0..C3. Usage: status <lane> <feature|none> <R|S|A|U> <note>' }
    if (($Ctx.AgentId -ne $Lane) -and ($Ctx.AgentId -ne 'LEAD')) { throw "AgentId $($Ctx.AgentId) may only update its own lane card (or use -AgentId LEAD)." }
    # A bare "-" cannot be passed through powershell -File (PowerShell binds it as a parameter name), so "none" and "_" mean the same.
    $noFeature = (@('-', '--', '_', 'NONE', 'N/A') -contains $Feature)
    if ($noFeature) { $Feature = '-' }
    if (-not $noFeature -and -not $script:BoardFeatures.ContainsKey($Feature)) { throw "Unknown or retired feature '$Feature' (use none for no feature). Usage: status <lane> <feature|none> <R|S|A|U> <note>" }
    if (@('R', 'S', 'A', 'U') -notcontains $Code) { throw 'Status must be R, S, A or U.' }
    $Note = ([string]$Note).Trim()
    if ($Note.Length -gt 500) { throw 'Status note is over 500 characters; keep the card short and put detail in EVIDENCE.md.' }
    $cardSha = $null
    if (-not [string]::IsNullOrWhiteSpace($Sha)) { $cardSha = $Sha.ToLowerInvariant() }
    $parts = @($null, $null, $null)
    if (-not $noFeature) {
        $parts = $script:BoardFeatures[$Feature].Split('|')
        if (($parts[0] -ne $Lane) -and -not (Test-BoardOrchestrator $Lane)) { Write-BoardWarning "$Feature is owned by $($parts[0]) in PLAN.md; updating the $Lane card anyway." }
    }
    $featureId = $null
    if (-not $noFeature) { $featureId = $Feature }
    $card = [ordered]@{ person = $Lane.Substring(0, 1); feature_id = $featureId; slug = $parts[1]; tier = $parts[2]; status = $Code; note = $Note; sha = $cardSha; blocked = $IsBlocked }
    $result = Send-SitesWrite -Ctx $Ctx -Method 'PUT' -Path "/api/lanes/$Lane" -Json (ConvertTo-Json -InputObject $card -Depth 5 -Compress) -Expect 'lane' -QueueName "lane-$Lane"
    if ($result.Ok) { Write-Output (("Sites lane card: $Lane $Feature $($parts[1]) $($parts[2]) $Code") -replace '\s{2,}', ' ') } else { Write-Output ($result.Note -replace '^Sites:', 'Sites lane card:') }
    # The STATUS line is mirrored like any post; readers never wake on it.
    Invoke-BoardPost -Ctx $Ctx -Message ("STATUS $Lane $Feature $Code $Note").TrimEnd() -PostId $PostId -Sha $Sha
}

function Invoke-BoardStage {
    param([hashtable]$Ctx, [string]$Person, [string]$Summary, [string]$PostId)
    $Person = ([string]$Person).Trim().ToUpperInvariant()
    $Summary = ([string]$Summary).Trim()
    if ($Person -notmatch '^[ABC]$') { throw 'Usage: stage <A|B|C> "<summary up to 400 characters>"' }
    if ($Summary.Length -eq 0) { throw 'Stage summary is empty. Usage: stage <A|B|C> "<summary up to 400 characters>"' }
    if ($Summary.Length -gt $script:BoardStageLimit) { throw "Stage summary is $($Summary.Length) characters; keep it to $($script:BoardStageLimit) (done, doing, blocked, next, usage)." }
    if (($Ctx.AgentId -ne ($Person + '0')) -and ($Ctx.AgentId -ne 'LEAD')) { throw "AgentId $($Ctx.AgentId) may not post STAGE for person ${Person}: only ${Person}0 (or LEAD) can." }
    if ([string]::IsNullOrWhiteSpace($PostId)) { $PostId = "stage-$Person-" + (Get-BoardUtcNow).ToString('yyyyMMddHHmmss') }
    $card = [ordered]@{ person = $Person; summary = $Summary; lane = $Ctx.AgentId }
    $result = Send-SitesWrite -Ctx $Ctx -Method 'PUT' -Path "/api/people/$Person" -Json (ConvertTo-Json -InputObject $card -Depth 5 -Compress) -Expect 'person' -QueueName "person-$Person"
    if ($result.Ok) { Write-Output "Sites person card: $Person updated" } else { Write-Output ($result.Note -replace '^Sites:', 'Sites person card:') }
    # The STAGE line is mirrored like any post and written to the local marker the Stop hook uses; readers never wake on it.
    Invoke-BoardPost -Ctx $Ctx -Message "STAGE $Person $Summary" -PostId $PostId
}

function Invoke-BoardCheck {
    param([hashtable]$Ctx)
    $login = Get-BoardLogin $Ctx
    $repository = Invoke-BoardGhJson -Arguments @('api', "repos/$($Ctx.Repo)")
    Assert-GitHubBoardRoster -Ctx $Ctx -Repository $repository
    $board = Invoke-BoardGhJson -Arguments @('api', "repos/$($Ctx.Repo)/issues/$($Ctx.Issue)")
    if ($board.PSObject.Properties.Name -contains 'pull_request') { throw 'This number points to a PR, not the message board issue.' }
    Write-Output "GitHub user: $login"
    Write-Output "Board: $($board.html_url) state=$($board.state) private=$($repository.private)"
    Write-Output "Agent: $($Ctx.AgentId). Read source: $($Ctx.Source). Secrets file: $(if ($Ctx.Config.SecretsFileLoaded) { 'found' } else { 'not found' })."
    if ($Ctx.TeamLogins.Count -gt 0) { Write-Output "Team logins: $($Ctx.TeamLogins.Count) configured (other GitHub authors are ignored)." }
    else { Write-Output 'Team logins: BOARD_TEAM_LOGINS not set (every GitHub author is accepted).' }
    if (-not $Ctx.SitesReady) { Write-Output "Sites: not used ($($Ctx.SitesReason)). GitHub only." }
    else {
        try {
            $lanes = Invoke-SitesApi -Ctx $Ctx -Method 'GET' -Path '/api/lanes' -Expect 'lanes'
            Write-Output "Sites: OK ($(@($lanes.lanes).Count) lane cards) at $(([Uri]$Ctx.Config.SITES_URL).Host)"
            try { $people = Invoke-SitesApi -Ctx $Ctx -Method 'GET' -Path '/api/people' -Expect 'people'; Write-Output "Sites people cards: OK ($(@($people.people).Count))" }
            catch { Write-Output "Sites people cards: UNAVAILABLE - $($_.Exception.Message) (stage still posts to GitHub; ask the dashboard builder to add /api/people)" }
        }
        catch { Write-Output "Sites: FAILED - $($_.Exception.Message) Reads fall back to GitHub; set BOARD_SOURCE=github if this persists." }
    }
    Write-Output 'Check is read-only. No comments or posts were written.'
}

# ---------- entry point ----------

function Invoke-TeamBoard {
    [CmdletBinding()]
    param(
        [Parameter(Position = 0)][ValidateSet('Check', 'Read', 'Post', 'Watch', 'Wait', 'Status', 'Stage')][string]$Mode = 'Check',
        [Parameter(Position = 1, ValueFromRemainingArguments = $true)][string[]]$Arguments = @(),
        [string]$Repo = '', [int]$Issue = 0, [string]$AgentId = '',
        [string]$MessageFile = '', [string]$Text = '', [string]$PostId = '', [string]$Sha = '', [switch]$Blocked,
        [string]$StateRoot = '.team-board', [string]$SecretsFile = '', [string]$Source = '',
        [ValidateRange(10, 300)][int]$PollSeconds = 30,
        [ValidateRange(1, 3600)][int]$DurationSeconds = 1800,
        [switch]$AsHookJson, [switch]$Frozen
    )
    $Arguments = @($Arguments | Where-Object { -not [string]::IsNullOrEmpty($_) })
    $config = Get-BoardConfig -SecretsFile $SecretsFile
    if ([string]::IsNullOrWhiteSpace($Repo)) { $Repo = $config.BOARD_REPO }
    if ($Issue -lt 1 -and $config.BOARD_ISSUE -match '^\d{1,9}$') { $Issue = [int]$config.BOARD_ISSUE }
    if ([string]::IsNullOrWhiteSpace($AgentId) -and $Mode -eq 'Status' -and $Arguments.Count -gt 0) { $AgentId = $Arguments[0] }
    if ([string]::IsNullOrWhiteSpace($AgentId)) {
        $laneFile = Resolve-BoardPath '.lane'
        if ([IO.File]::Exists($laneFile)) { $AgentId = ([IO.File]::ReadAllText($laneFile)).Trim() }
    }
    if ($Repo -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'Repo must be an explicit owner/name, without a URL (or set BOARD_REPO).' }
    if ($Issue -lt 1) { throw 'Issue must be a positive issue number (or set BOARD_ISSUE).' }
    if ($AgentId -notmatch '^[A-Za-z0-9_-]{1,40}$') { throw 'AgentId must contain 1-40 letters, digits, underscores or hyphens (or create a .lane file).' }
    if ($AgentId -match '^(?i)(?:[abc][0-3]|lead)$') { $AgentId = $AgentId.ToUpperInvariant() }

    $readSource = $Source
    if ([string]::IsNullOrWhiteSpace($readSource)) { $readSource = $config.BOARD_SOURCE }
    if ([string]::IsNullOrWhiteSpace($readSource)) { $readSource = 'sites' }
    $readSource = $readSource.Trim().ToLowerInvariant()
    if (@('sites', 'github') -notcontains $readSource) { throw 'BOARD_SOURCE must be sites or github.' }
    $sitesReady = $false
    $sitesReason = ''
    if ([string]::IsNullOrWhiteSpace($config.SITES_URL)) { $sitesReason = 'SITES_URL not set' }
    elseif ($config.SITES_URL -notmatch '^(?:https://[^\s/?#]+|http://(?:localhost|127\.0\.0\.1)(?::\d+)?)/?$') { $sitesReason = 'SITES_URL must be an https:// origin' }
    elseif ([string]::IsNullOrWhiteSpace($config.SITES_BYPASS_TOKEN) -or [string]::IsNullOrWhiteSpace($config.BOARD_SECRET)) { $sitesReason = 'SITES_BYPASS_TOKEN or BOARD_SECRET missing' }
    else { $sitesReady = $true }
    $teamLogins = @(([string]$config.BOARD_TEAM_LOGINS -split '[,;\s]+') | ForEach-Object { $_.TrimStart('@').ToLowerInvariant() } | Where-Object { $_ -match '^[a-z0-9][a-z0-9-]{0,38}$' } | Select-Object -Unique)

    $stateDirectory = Resolve-BoardPath $StateRoot
    [void][IO.Directory]::CreateDirectory($stateDirectory)
    $ctx = @{
        Repo = $Repo; Issue = $Issue; AgentId = $AgentId; StateDirectory = $stateDirectory; Config = $config
        Frozen = [bool]$Frozen; Source = $readSource; SitesReady = $sitesReady; SitesReason = $sitesReason; TeamLogins = $teamLogins; Login = ''
        InboxKey = (Get-BoardHash "$Repo|$Issue|$AgentId"); SitesKey = (Get-BoardHash "$($config.SITES_URL)|$Repo|$Issue|$AgentId")
    }

    if ($Mode -eq 'Check') { Invoke-BoardCheck -Ctx $ctx; return }
    if ($Mode -eq 'Post') {
        $message = ''
        if (-not [string]::IsNullOrWhiteSpace($MessageFile)) {
            $messagePath = Resolve-BoardPath $MessageFile
            if (-not [IO.File]::Exists($messagePath)) { throw 'Post requires an existing UTF-8 MessageFile.' }
            if ([IO.FileInfo]::new($messagePath).Length -gt 20000) { throw 'MessageFile is over 20 KB; send a concise handoff with links.' }
            $message = [IO.File]::ReadAllText($messagePath, [Text.Encoding]::UTF8).Trim()
        }
        elseif (-not [string]::IsNullOrWhiteSpace($Text)) { $message = $Text.Trim() }
        elseif ($Arguments.Count -gt 0) { $message = ($Arguments -join ' ').Trim() }
        else { throw 'Post requires an existing UTF-8 MessageFile (or -Text).' }
        if ([string]::IsNullOrWhiteSpace($message)) { throw 'MessageFile is empty.' }
        Invoke-BoardPost -Ctx $ctx -Message $message -PostId $PostId -Sha $Sha
        return
    }
    if ($Mode -eq 'Status') {
        if ($Arguments.Count -lt 3) { throw 'Usage: status <lane> <feature|none> <R|S|A|U> <note> [-Sha <sha>] [-Blocked]' }
        $note = $Text
        if ([string]::IsNullOrWhiteSpace($note) -and $Arguments.Count -gt 3) { $note = ($Arguments[3..($Arguments.Count - 1)] -join ' ') }
        Invoke-BoardStatus -Ctx $ctx -Lane $Arguments[0] -Feature $Arguments[1] -Code $Arguments[2] -Note $note -Sha $Sha -IsBlocked ([bool]$Blocked) -PostId $PostId
        return
    }
    if ($Mode -eq 'Stage') {
        if ($Arguments.Count -lt 1) { throw 'Usage: stage <A|B|C> "<summary up to 400 characters>"' }
        $summary = $Text
        if ([string]::IsNullOrWhiteSpace($summary) -and $Arguments.Count -gt 1) { $summary = ($Arguments[1..($Arguments.Count - 1)] -join ' ') }
        Invoke-BoardStage -Ctx $ctx -Person $Arguments[0] -Summary $summary -PostId $PostId
        return
    }
    if ($Mode -eq 'Read') { Invoke-BoardRead -Ctx $ctx; return }
    if ($Mode -eq 'Wait') {
        $waitSeconds = $DurationSeconds
        if (-not $PSBoundParameters.ContainsKey('DurationSeconds')) { $waitSeconds = 540 }
        Invoke-BoardWait -Ctx $ctx -PollSeconds $PollSeconds -DurationSeconds $waitSeconds -AsHookJson:$AsHookJson
        return
    }
    # Watch: a human terminal view of every post. It must not consume the Codex inbox cursor.
    $deadline = (Get-BoardUtcNow).AddSeconds($DurationSeconds)
    Write-Output 'Watcher prints messages only. It does not start Codex, run commands, reserve files, or merge code. Ctrl+C stops it.'
    while ((Get-BoardUtcNow) -lt $deadline) {
        Invoke-BoardRead -Ctx $ctx -AllPosts -Quiet
        $remaining = ($deadline - (Get-BoardUtcNow)).TotalSeconds
        if ($remaining -le 0) { break }
        Start-Sleep -Seconds ([Math]::Min($PollSeconds, [Math]::Max(1, [Math]::Ceiling($remaining))))
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    # Hooks and Codex read stdout as UTF-8; the console default code page would turn Thai into '?'.
    $previousEncoding = $null
    try { $previousEncoding = [Console]::OutputEncoding; [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch { }
    try { Invoke-TeamBoard @PSBoundParameters }
    finally { if ($null -ne $previousEncoding) { try { [Console]::OutputEncoding = $previousEncoding } catch { } } }
}
