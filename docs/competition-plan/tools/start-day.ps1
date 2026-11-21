# One-command start for a person (A, B or C). Original team helper, no application code.
# Run from the planning repo; everything is created beside it:
#   <root>\sea (this repo)   <root>\nless (competition clone)   <root>\nless-<p>0..3 (worktrees)   <root>\nless.secrets.env
#
#   -Mode Prep  (the night before / the morning): machine files, secrets skeleton, repo access, preflight, alert test.
#   -Mode Day   (10:00): competition repo -> clone -> baseline (only with -Baseline) -> 4 worktrees + .lane -> board check
#               -> prints the clicks and the one line to type in each of the 4 chats.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\start-day.ps1 -Person A -Mode Prep
#   -CreateRepo in Prep is only for a private rehearsal repo.
#   powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\start-day.ps1 -Person C -Mode Day -Baseline
#   powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\start-day.ps1 -Person A -Mode Day
#
# Every line is [PASS] [WARN] [FAIL] [WAIT] [INFO] [CHECK] or [HUMAN] (= a person must do it). Safe to run again: finished steps are skipped.
# Secrets are never printed. Exit code 1 when a [FAIL] or an unfinished [HUMAN] step remains. ASCII only (Windows PowerShell 5.1).
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('A', 'B', 'C')][string]$Person,
    [ValidateSet('Prep', 'Day')][string]$Mode = 'Day',
    [switch]$Baseline,
    [switch]$CreateRepo,
    [string]$Root = '',
    [string]$Repo = '',
    [string]$RemoteUrl = '',
    [ValidateRange(0, 120)][int]$WaitMinutes = 15,
    [switch]$SkipPreflight,
    [switch]$NoAlert
)

$ErrorActionPreference = 'Continue'
$Person = $Person.ToUpperInvariant()
$p = $Person.ToLowerInvariant()
$script:Fails = 0
$script:Humans = New-Object System.Collections.ArrayList
$script:ToolsDir = $PSScriptRoot
$plan = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = [IO.Path]::GetFullPath((Join-Path $plan '..')) } else { $Root = [IO.Path]::GetFullPath($Root) }
$secretsPath = Join-Path $Root 'nless.secrets.env'
$mainClone = Join-Path $Root 'nless'
$teamPath = Join-Path $plan 'docs\competition-plan\team.json'
$offline = -not [string]::IsNullOrWhiteSpace($RemoteUrl)
# Person C owns the competition repo and its first commit, so on the day C creates what is missing without extra switches.
if ($Person -eq 'C' -and $Mode -eq 'Day') { $Baseline = $true; $CreateRepo = $true }

function Say {
    param([string]$Status, [string]$Text)
    if ($Status -eq 'FAIL') { $script:Fails++ }
    if ($Status -eq 'HUMAN') { [void]$script:Humans.Add($Text) }
    Write-Output ("[{0}] {1}" -f $Status, $Text)
}

function ConvertTo-Arg {
    param([string]$Value)
    if ($Value -notmatch '[\s"]' -and $Value.Length -gt 0) { return $Value }
    return '"' + ($Value -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
}

function Invoke-Exe {
    param([string]$File, [string[]]$Arguments, [string]$WorkDir = '', [int]$TimeoutSec = 180)
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $File
    $info.Arguments = (@($Arguments | ForEach-Object { ConvertTo-Arg ([string]$_) }) -join ' ')
    $info.UseShellExecute = $false
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.CreateNoWindow = $true
    try { $info.StandardOutputEncoding = [Text.Encoding]::UTF8; $info.StandardErrorEncoding = [Text.Encoding]::UTF8 } catch { }
    if ($WorkDir) { $info.WorkingDirectory = $WorkDir }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    try { [void]$process.Start() } catch { return [pscustomobject]@{ ExitCode = -2; Out = ''; Err = $_.Exception.Message } }
    $outTask = $process.StandardOutput.ReadToEndAsync()
    $errTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutSec * 1000)) { try { $process.Kill() } catch { }; return [pscustomobject]@{ ExitCode = -1; Out = ''; Err = "timed out after $TimeoutSec s" } }
    $process.WaitForExit()
    return [pscustomobject]@{ ExitCode = $process.ExitCode; Out = ([string]$outTask.Result).Trim(); Err = ([string]$errTask.Result).Trim() }
}

function Find-Exe {
    param([string]$Name)
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    return ''
}

function Short {
    param([string]$Text, [int]$Max = 220)
    $one = (([string]$Text) -replace '\s+', ' ').Trim()
    if ($one.Length -gt $Max) { return $one.Substring(0, $Max - 3) + '...' }
    return $one
}

function Send-Human {
    # Beeps + Windows toast through alert.ps1 beside this script.
    param([string]$Text, [string]$Level = 'blocked')
    if ($NoAlert) { return }
    $alert = Join-Path $script:ToolsDir 'alert.ps1'
    if (-not [IO.File]::Exists($alert)) { return }
    try { $note = (& $alert -Message @($Text) -Level $Level -Lane "$Person" -SecretsFile $secretsPath | Out-String).Trim(); if ($note) { Write-Output "[INFO] $note" } } catch { }
}

function Read-EnvNames {
    # Names with a non-empty value. Values stay inside $script:EnvValues and are never printed.
    param([string]$Path)
    $names = @{}
    $script:EnvValues = @{}
    if (-not [IO.File]::Exists($Path)) { return $names }
    foreach ($line in [IO.File]::ReadAllLines($Path, [Text.Encoding]::UTF8)) {
        $entry = $line.Trim()
        if ($entry.Length -eq 0 -or $entry.StartsWith('#')) { continue }
        if ($entry.StartsWith('export ')) { $entry = $entry.Substring(7).TrimStart() }
        $eq = $entry.IndexOf('=')
        if ($eq -lt 1) { continue }
        $value = $entry.Substring($eq + 1).Trim().Trim('"').Trim("'")
        if ($value.Length -gt 0) { $name = $entry.Substring(0, $eq).Trim(); $names[$name] = $true; $script:EnvValues[$name] = $value }
    }
    return $names
}

function Add-EnvLine {
    # Fills an empty "NAME=" line in place; appends when the name is not in the file. Never overwrites a value.
    param([string]$Path, [string]$Name, [string]$Value)
    $lines = New-Object System.Collections.ArrayList
    if ([IO.File]::Exists($Path)) { foreach ($line in [IO.File]::ReadAllLines($Path, [Text.Encoding]::UTF8)) { [void]$lines.Add($line) } }
    $done = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if (-not $done -and ([string]$lines[$i]) -match ('^\s*' + [regex]::Escape($Name) + '\s*=\s*$')) { $lines[$i] = "$Name=$Value"; $done = $true }
    }
    if (-not $done) { [void]$lines.Add("$Name=$Value") }
    [IO.File]::WriteAllLines($Path, [string[]]$lines, [Text.UTF8Encoding]::new($false))
}

function Read-Team {
    $team = [pscustomobject]@{ competitionRepo = ''; boardIssue = 0; lead = ''; people = [pscustomobject]@{ A = [pscustomobject]@{ name = ''; login = '' }; B = [pscustomobject]@{ name = ''; login = '' }; C = [pscustomobject]@{ name = ''; login = '' } } }
    if ([IO.File]::Exists($teamPath)) {
        try { $team = [IO.File]::ReadAllText($teamPath, [Text.Encoding]::UTF8) | ConvertFrom-Json } catch { Say 'FAIL' "team.json is not valid JSON: $teamPath" }
    }
    return $team
}

function Get-TeamLogin {
    param($Team, [string]$Letter)
    try { return ([string]$Team.people.$Letter.login).Trim().TrimStart('@') } catch { return '' }
}

function Get-TeamMap {
    # Placeholder -> value for the prompts. Empty values are left out (the placeholder then stays and is reported).
    param($Team)
    $map = [ordered]@{}
    foreach ($letter in 'A', 'B', 'C') {
        $login = Get-TeamLogin $Team $letter
        $name = ''
        try { $name = ([string]$Team.people.$letter.name).Trim() } catch { }
        if ($login) { $map["REPLACE_${letter}_LOGIN"] = $login }
        if ($name) { $map["REPLACE_${letter}_NAME"] = $name } elseif ($login) { $map["REPLACE_${letter}_NAME"] = $login }
    }
    $lead = ([string]$Team.lead).Trim().ToUpperInvariant()
    if ($lead -match '^[ABC]$') {
        $leadLogin = Get-TeamLogin $Team $lead
        if ($leadLogin) { $map['REPLACE_LEAD_LOGIN'] = $leadLogin }
        if ($map.Contains("REPLACE_${lead}_NAME")) { $map['REPLACE_LEAD_NAME'] = $map["REPLACE_${lead}_NAME"] }
    }
    return $map
}

function Copy-Baseline {
    # Planning repo -> competition repo (prompts/C1-setup.md section 0.2). Only git-tracked files are copied, so no secrets,
    # node_modules or scratch output can travel. tools/openai-check and anything from the company codebase are never copied.
    param([string]$Git, [string]$Destination, $Team)
    $listed = Invoke-Exe -File $Git -Arguments @('-c', 'core.quotepath=off', 'ls-files', '--', 'docs', 'prompts') -WorkDir $plan
    if ($listed.ExitCode -ne 0) { throw "git ls-files failed in the planning repo: $(Short $listed.Err)" }
    $count = 0
    foreach ($relative in ($listed.Out -split "`n")) {
        $relative = $relative.Trim()
        if (-not $relative) { continue }
        $from = Join-Path $plan ($relative -replace '/', '\')
        if (-not [IO.File]::Exists($from)) { continue }
        $to = Join-Path $Destination ($relative -replace '/', '\')
        [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($to))
        [IO.File]::Copy($from, $to, $true)
        $count++
    }
    $templates = Join-Path $plan 'docs\competition-plan\templates'
    foreach ($name in 'AGENTS.md', 'contracts.ts', '.env.example', 'SPEC.md', '.gitignore', '.gitattributes') {
        $from = Join-Path $templates $name
        if ([IO.File]::Exists($from)) { [IO.File]::Copy($from, (Join-Path $Destination $name), $true); $count++ }
    }
    # START.md (how to start) and PLAN.md (the plan that 50+ copied docs link to as ../PLAN.md) sit at the root.
    foreach ($name in 'START.md', 'PLAN.md') {
        $from = Join-Path $plan $name
        if ([IO.File]::Exists($from)) { [IO.File]::Copy($from, (Join-Path $Destination $name), $true); $count++ }
    }
    $toolsOut = Join-Path $Destination 'tools'
    [void][IO.Directory]::CreateDirectory($toolsOut)
    foreach ($name in 'team-board.ps1', 'alert.ps1') {
        $from = Join-Path $script:ToolsDir $name
        if ([IO.File]::Exists($from)) { [IO.File]::Copy($from, (Join-Path $toolsOut $name), $true); $count++ }
    }
    # .codex = templates\codex without README.md and without user\ (user\ is the template of %USERPROFILE%\.codex).
    $codexFrom = Join-Path $templates 'codex'
    $codexTo = Join-Path $Destination '.codex'
    foreach ($path in ($listed.Out -split "`n")) {
        $prefix = 'docs/competition-plan/templates/codex/'
        if (-not $path.StartsWith($prefix, [StringComparison]::Ordinal)) { continue }
        $relative = $path.Trim().Substring($prefix.Length).Replace('/', '\')
        if ($relative -eq 'README.md' -or $relative.StartsWith('user\')) { continue }
        $file = Join-Path $codexFrom $relative
        $to = Join-Path $codexTo $relative
        [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($to))
        [IO.File]::Copy($file, $to, $true)
        $count++
    }
    # Names and logins: fill the placeholders of the prompt pack from team.json.
    $map = Get-TeamMap $Team
    $left = 0
    $targets = @()
    $promptsOut = Join-Path $Destination 'prompts'
    if ([IO.Directory]::Exists($promptsOut)) { $targets += [IO.Directory]::GetFiles($promptsOut, '*.md', [IO.SearchOption]::AllDirectories) }
    $targets += (Join-Path $Destination 'AGENTS.md')
    foreach ($file in $targets) {
        if (-not [IO.File]::Exists($file)) { continue }
        $text = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8)
        $changed = $text
        foreach ($key in $map.Keys) { $changed = $changed.Replace($key, [string]$map[$key]) }
        if ($changed -ne $text) { [IO.File]::WriteAllText($file, $changed, [Text.UTF8Encoding]::new($false)) }
        $left += [regex]::Matches($changed, 'REPLACE_(?:[ABC]|LEAD)_(?:LOGIN|NAME)').Count
    }
    return [pscustomobject]@{ Files = $count; PlaceholdersLeft = $left }
}

# ---------------------------------------------------------------- start
Write-Output "== Endless start: person $Person, mode $Mode =="
Write-Output "[INFO] planning repo: $plan"
Write-Output "[INFO] work folder:   $Root   (competition clone: nless, worktrees: nless-${p}0..3, secrets: nless.secrets.env)"
if ($Root -match '\s' -or $Root -match '[^\x00-\x7F]') { Say 'WARN' 'The work folder path has spaces or non-ASCII characters. A short path such as C:\hack is safer (long paths, npm, Playwright).' }
if ($Root.Length -gt 40) { Say 'WARN' "The work folder path is $($Root.Length) characters long. A short path such as C:\hack is safer on Windows." }

# ---- 1. tools
$git = Find-Exe 'git'
$gh = Find-Exe 'gh'
$node = Find-Exe 'node'
if ($git) { Say 'PASS' ("git: " + (Short (Invoke-Exe -File $git -Arguments @('--version')).Out)) } else { Say 'FAIL' 'git is not installed. HUMAN: winget install --id Git.Git -e   (then reopen the app)' }
if ($node) {
    $nodeVersion = (Invoke-Exe -File $node -Arguments @('--version')).Out
    if ($nodeVersion -match '^v24\.') { Say 'PASS' "Node.js $nodeVersion" } else { Say 'FAIL' "Node.js is $nodeVersion, the team standard is 24.x. HUMAN: winget install --id OpenJS.NodeJS.LTS -e" }
}
else { Say 'FAIL' 'Node.js is not installed. HUMAN: winget install --id OpenJS.NodeJS.LTS -e   (need 24.x)' }
$login = ''
if ($offline) { $login = 'offline-test' }
elseif (-not $gh) { Say 'FAIL' 'GitHub CLI is not installed. HUMAN: winget install --id GitHub.cli -e   then: gh auth login' }
else {
    $who = Invoke-Exe -File $gh -Arguments @('api', 'user', '--jq', '.login') -TimeoutSec 40
    if ($who.ExitCode -eq 0 -and $who.Out) { $login = $who.Out.Trim(); Say 'PASS' "GitHub CLI signed in as $login" }
    else { Say 'FAIL' 'GitHub CLI is not signed in. HUMAN: run in a terminal: gh auth login   (GitHub.com, HTTPS, browser)' }
}
if ($git) {
    if ((Invoke-Exe -File $git -Arguments @('config', '--global', '--get', 'core.longpaths')).Out -ne 'true') {
        [void](Invoke-Exe -File $git -Arguments @('config', '--global', 'core.longpaths', 'true'))
        Say 'PASS' 'git core.longpaths set to true'
    }
    if (-not (Invoke-Exe -File $git -Arguments @('config', '--global', '--get', 'user.name')).Out) { Say 'HUMAN' 'git has no user.name / user.email (commits fail). Run: git config --global user.name "<name>"  and  git config --global user.email "<email>"' }
    if ($gh -and $login -and -not $offline) { [void](Invoke-Exe -File $gh -Arguments @('auth', 'setup-git') -TimeoutSec 40) }
}

# ---- 2. team.json
$team = Read-Team
$map = Get-TeamMap $team
$expected = Get-TeamLogin $team $Person
if (-not [IO.File]::Exists($teamPath)) { Say 'FAIL' "team.json is missing: $teamPath" }
elseif ($map.Count -lt 8) { Say 'WARN' "team.json is not complete (people A/B/C name + login, lead). Prompts keep REPLACE_* placeholders until it is filled: $teamPath" }
else { Say 'PASS' "team.json: A=$(Get-TeamLogin $team 'A') B=$(Get-TeamLogin $team 'B') C=$(Get-TeamLogin $team 'C') lead=$($team.lead)" }
if ($expected -and $login -and -not $offline -and ($expected.ToLowerInvariant() -ne $login.ToLowerInvariant())) { Say 'WARN' "team.json says person $Person is $expected, but this PC is signed in to GitHub as $login. Check that you typed the right letter." }
if ([string]::IsNullOrWhiteSpace($Repo)) { $Repo = ([string]$team.competitionRepo).Trim() }

# ---- 3. secrets file (names only)
$required = @('OPENAI_API_KEY', 'PG_SERVER_URL', 'BOARD_REPO', 'BOARD_ISSUE', 'BOARD_TEAM_LOGINS')
# A -Root that does not exist yet is created first, so the secrets skeleton below can be written into it.
if (-not [IO.Directory]::Exists($Root)) { try { [void][IO.Directory]::CreateDirectory($Root) } catch { Say 'FAIL' "cannot create the work folder $Root" } }
if (-not [IO.File]::Exists($secretsPath)) {
    $skeleton = @('# Endless hackathon: local secrets for THIS PC. Never commit, paste, post or screenshot this file.', '# One NAME=value per line, no quotes. Type the values yourself from each dashboard.', '',
        '# OpenAI project app-dev of this person (hard limit US$30)', 'OPENAI_API_KEY=', '',
        '# Neon DIRECT connection string of your own project (host without -pooler, ends with ?sslmode=require)', 'PG_SERVER_URL=', '',
        '# Team board. BOARD_SOURCE=github works without the Sites dashboard.', 'BOARD_SOURCE=github', 'BOARD_REPO=', 'BOARD_ISSUE=', 'BOARD_TEAM_LOGINS=', 'SITES_URL=', 'SITES_BYPASS_TOKEN=', 'BOARD_SECRET=', '')
    try { [IO.File]::WriteAllLines($secretsPath, $skeleton, [Text.UTF8Encoding]::new($false)); Say 'INFO' "created an empty secrets file: $secretsPath" } catch { Say 'FAIL' "cannot create $secretsPath" }
}
$names = Read-EnvNames $secretsPath
# Non-secret board values come from team.json, so nobody has to type them.
$teamLogins = @(foreach ($letter in 'A', 'B', 'C') { $one = Get-TeamLogin $team $letter; if ($one) { $one } }) -join ','
if (-not $names.ContainsKey('BOARD_REPO') -and $Repo -match '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { Add-EnvLine $secretsPath 'BOARD_REPO' $Repo }
if (-not $names.ContainsKey('BOARD_ISSUE') -and [int]$team.boardIssue -gt 0) { Add-EnvLine $secretsPath 'BOARD_ISSUE' ([string][int]$team.boardIssue) }
if (-not $names.ContainsKey('BOARD_TEAM_LOGINS') -and $teamLogins -match ',.+,') { Add-EnvLine $secretsPath 'BOARD_TEAM_LOGINS' $teamLogins }
if (-not $names.ContainsKey('BOARD_SOURCE') -and -not $names.ContainsKey('SITES_URL')) { Add-EnvLine $secretsPath 'BOARD_SOURCE' 'github' }
$names = Read-EnvNames $secretsPath
$missing = @($required | Where-Object { -not $names.ContainsKey($_) -and -not ($_ -eq 'BOARD_ISSUE' -and $Mode -eq 'Day' -and $CreateRepo -and [int]$team.boardIssue -lt 1) })
if ($missing.Count -eq 0) { Say 'PASS' 'secrets file has every required name' }
else {
    foreach ($name in $missing) {
        if ($name -eq 'OPENAI_API_KEY') { Say 'HUMAN' "Put OPENAI_API_KEY in $secretsPath : platform.openai.com > project app-dev (create it, set a US`$30 hard limit) > API keys > create, then type it into the file." }
        elseif ($name -eq 'PG_SERVER_URL') { Say 'HUMAN' "Put PG_SERVER_URL in $secretsPath : console.neon.tech > your project nless-hack-$p > Connect > switch OFF 'Connection pooling' > copy the string (must end with ?sslmode=require)." }
        else { Say 'HUMAN' "$name is empty in $secretsPath (it normally comes from docs\competition-plan\team.json: ask the lead to fill team.json, pull, and run this again)." }
    }
}
if ($names.ContainsKey('PG_SERVER_URL') -and ([string]$script:EnvValues['PG_SERVER_URL']) -match '-pooler\.') { Say 'FAIL' 'PG_SERVER_URL points at the Neon POOLED endpoint (-pooler in the host). Use the direct connection string.' }
if (-not $names.ContainsKey('SITES_URL')) { Say 'INFO' 'SITES_URL is empty: the board runs on the GitHub issue only (that is a supported mode).' }

# ---- 4. competition repo
$repoOk = $false
$repoUrl = $RemoteUrl
$rosterOk = $true
if ($Mode -eq 'Day' -and -not $offline) {
    $configuredRoster = $env:BOARD_TEAM_LOGINS
    if ([string]::IsNullOrWhiteSpace($configuredRoster)) { $configuredRoster = [string]$script:EnvValues['BOARD_TEAM_LOGINS'] }
    $expectedLogins = @($teamLogins -split ',' | Where-Object { $_ -match '^[a-z0-9][a-z0-9-]{0,38}$' } | Sort-Object -Unique)
    $configuredLogins = @(([string]$configuredRoster -split '[,;\s]+') | ForEach-Object { $_.TrimStart('@') } | Where-Object { $_ } | Sort-Object -Unique)
    $rosterOk = $expectedLogins.Count -eq 3 -and ($expectedLogins -join ',') -eq ($configuredLogins -join ',')
}
if ($offline) { $repoOk = $true }
elseif (-not $rosterOk) { Say 'FAIL' 'For Day mode BOARD_TEAM_LOGINS must match the three distinct GitHub logins in team.json on this PC.' }
elseif ($Repo -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { Say 'FAIL' "No competition repo name. Fill competitionRepo (owner/name) in $teamPath or pass -Repo owner/name." }
elseif ($gh -and $login) {
    $repoUrl = "https://github.com/$Repo.git"
    $deadline = [DateTime]::UtcNow.AddMinutes($WaitMinutes)
    $told = $false
    while ($true) {
        $view = Invoke-Exe -File $gh -Arguments @('repo', 'view', $Repo, '--json', 'viewerPermission,visibility', '--jq', '.viewerPermission + " " + .visibility') -TimeoutSec 40
        if ($view.ExitCode -eq 0) {
            if ($Mode -eq 'Day' -and $view.Out -notmatch '\sPUBLIC$') { Say 'FAIL' "$Repo is not public. Use the fresh public competition repo from START.md Day." }
            elseif ($view.Out -match '^(ADMIN|MAINTAIN|WRITE)') { $repoOk = $true; Say 'PASS' "competition repo $Repo ($($view.Out))" }
            else { Say 'FAIL' "You can see $Repo but cannot push ($($view.Out)). HUMAN: ask the owner for write access." }
            break
        }
        if ($CreateRepo) {
            $visibility = if ($Mode -eq 'Day') { 'public' } else { 'private' }
            $made = Invoke-Exe -File $gh -Arguments @('repo', 'create', $Repo, "--$visibility", '--description', 'Endless - Sea x OpenAI Codex Hackathon Thailand (built during the event)') -TimeoutSec 60
            if ($made.ExitCode -ne 0) { Say 'FAIL' "could not create $Repo : $(Short $made.Err)"; break }
            Say 'PASS' "created the empty $visibility repo $Repo"
            foreach ($letter in 'A', 'B', 'C') {
                $other = Get-TeamLogin $team $letter
                if (-not $other -or $other.ToLowerInvariant() -eq $login.ToLowerInvariant()) { continue }
                $invite = Invoke-Exe -File $gh -Arguments @('api', '--method', 'PUT', "repos/$Repo/collaborators/$other", '-f', 'permission=push') -TimeoutSec 40
                if ($invite.ExitCode -eq 0) { Say 'HUMAN' "$other must accept the invitation NOW: https://github.com/$Repo/invitations" } else { Say 'FAIL' "could not invite $other : $(Short $invite.Err)" }
            }
            continue
        }
        if ($Mode -eq 'Prep' -or [DateTime]::UtcNow -ge $deadline) {
            Say 'HUMAN' "You cannot open $Repo yet. For Prep, use the rehearsal repo. At the event start C creates the new public repo via START.md Day. Accept the invitation at https://github.com/$Repo/invitations and run this again."
            break
        }
        if (-not $told) { $told = $true; Say 'WAIT' "competition repo $Repo is not visible yet; checking every 20 s for up to $WaitMinutes min"; Send-Human "Person ${Person}: cannot open the competition repo $Repo yet. Ask C to create it, then accept the invitation at github.com/$Repo/invitations" }
        Start-Sleep -Seconds 20
    }
}

# ---- 5. board issue (C creates it once, with the repo)
if ($repoOk -and -not $offline -and $CreateRepo -and [int]$team.boardIssue -lt 1) {
    $template = Join-Path $plan 'docs\competition-plan\templates\BOARD-ISSUE.md'
    $made = Invoke-Exe -File $gh -Arguments @('issue', 'create', '--repo', $Repo, '--title', 'Team board (agents post here; do not close)', '--body-file', $template) -TimeoutSec 60
    if ($made.ExitCode -eq 0 -and $made.Out -match '/issues/(\d+)') {
        $number = [int]$Matches[1]
        $team.boardIssue = $number
        $team.competitionRepo = $Repo
        [IO.File]::WriteAllText($teamPath, (($team | ConvertTo-Json -Depth 6) + "`n"), [Text.UTF8Encoding]::new($false))
        if (-not (Read-EnvNames $secretsPath).ContainsKey('BOARD_ISSUE')) { Add-EnvLine $secretsPath 'BOARD_ISSUE' ([string]$number) }
        Say 'PASS' "board issue #$number created; team.json updated"
    }
    else { Say 'FAIL' "could not create the board issue: $(Short $made.Err)" }
}
if ($repoOk -and -not $offline -and $CreateRepo -and [int]$team.boardIssue -gt 0) {
    $issueNumber = [string][int]$team.boardIssue
    $pinStatusArgs = @('issue', 'view', $issueNumber, '--repo', $Repo, '--json', 'isPinned', '--jq', '.isPinned')
    $pinStatus = Invoke-Exe -File $gh -Arguments $pinStatusArgs -TimeoutSec 40
    if ($pinStatus.ExitCode -eq 0 -and $pinStatus.Out -eq 'false') {
        [void](Invoke-Exe -File $gh -Arguments @('issue', 'pin', $issueNumber, '--repo', $Repo) -TimeoutSec 40)
        $pinStatus = Invoke-Exe -File $gh -Arguments $pinStatusArgs -TimeoutSec 40
    }
    if ($pinStatus.ExitCode -eq 0 -and $pinStatus.Out -eq 'true') {
        Say 'PASS' "pinned board verified: https://github.com/$Repo/issues/$issueNumber"
    }
    else { $repoOk = $false; Say 'FAIL' "could not verify pinned board issue #$issueNumber in $Repo; rerun after pinning it." }
}

if ($Mode -eq 'Prep') {
    # ---- P1. Codex user files
    $codexHome = Join-Path $env:USERPROFILE '.codex'
    $userTemplates = Join-Path $plan 'docs\competition-plan\templates\codex\user'
    try {
        [void][IO.Directory]::CreateDirectory((Join-Path $codexHome 'rules'))
        $rulesTo = Join-Path $codexHome 'rules\default.rules'
        $rulesNew = [IO.File]::ReadAllText((Join-Path $userTemplates 'default.rules'))
        if (-not [IO.File]::Exists($rulesTo)) { [IO.File]::WriteAllText($rulesTo, $rulesNew); Say 'PASS' "installed $rulesTo (restart the ChatGPT app)" }
        elseif (([IO.File]::ReadAllText($rulesTo) -replace "`r", '') -ne ($rulesNew -replace "`r", '')) { [IO.File]::Copy($rulesTo, "$rulesTo.bak", $true); [IO.File]::WriteAllText($rulesTo, $rulesNew); Say 'PASS' "updated $rulesTo (old copy: default.rules.bak; restart the ChatGPT app)" }
        else { Say 'PASS' 'Codex rules file is current' }
        $configTo = Join-Path $codexHome 'config.toml'
        $configNew = [IO.File]::ReadAllText((Join-Path $userTemplates 'config.toml')).Replace('REPLACE_ROOT', $Root).Replace('<p>', $p)
        # The Neon MCP block needs a real project id; leave it commented until the person adds it.
        $configNew = $configNew.Replace("[mcp_servers.neon]`r`nurl = ", "# [mcp_servers.neon]`r`n# url = ").Replace("[mcp_servers.neon]`nurl = ", "# [mcp_servers.neon]`n# url = ")
        if (-not [IO.File]::Exists($configTo)) { [IO.File]::WriteAllText($configTo, $configNew); Say 'PASS' "installed $configTo (model gpt-6.2-sol, network on, 64 KiB AGENTS.md limit, trust for nless-${p}0..3). The Neon MCP block is commented out until you add your project id (chatgpt-app-setup.md section 9, optional)." }
        else {
            $have = [IO.File]::ReadAllText($configTo)
            if ($have -match 'project_doc_max_bytes' -and $have -match 'network_access\s*=\s*true' -and $have.Contains("nless-${p}0")) { Say 'PASS' 'Codex user config already has the team settings' }
            else {
                $suggested = Join-Path $codexHome 'config.endless-suggested.toml'
                [IO.File]::WriteAllText($suggested, $configNew)
                Say 'HUMAN' "Your $configTo exists and lacks team settings. Merge these keys from $suggested : model, project_doc_max_bytes = 65536, [sandbox_workspace_write] network_access = true, the four [projects.'...'] blocks. Then restart the app."
            }
        }
        if ([IO.File]::Exists((Join-Path $codexHome 'AGENTS.md'))) { Say 'HUMAN' "Rename $codexHome\AGENTS.md for the day (a global AGENTS.md pushes the project rules over the size limit)." }
    }
    catch { Say 'FAIL' "could not write the Codex user files: $($_.Exception.Message)" }

    # ---- P2. preflight (tools, RAM, power plan, app, Playwright, database probe, board)
    if (-not $SkipPreflight) {
        Write-Output ''
        Write-Output '== preflight =='
        $pre = Join-Path $script:ToolsDir 'preflight.ps1'
        & powershell -NoProfile -ExecutionPolicy Bypass -File $pre -SecretsFile $secretsPath | ForEach-Object { Write-Output $_ }
        if ($LASTEXITCODE -ne 0) { Say 'FAIL' 'preflight has FAIL rows (table above). Fix them and run this again.' } else { Say 'PASS' 'preflight has no FAIL rows' }
    }

    # ---- P3. alert test
    Write-Output ''
    if (-not $NoAlert) {
        $alert = Join-Path $script:ToolsDir 'alert.ps1'
        $note = (& $alert -Test -Lane "$Person" -SecretsFile $secretsPath | Out-String).Trim()
        Write-Output "[INFO] $note"
        Write-Output '[CHECK] Confirm the alert test: you heard beeps and saw a Windows notification. If Windows showed nothing, turn on Settings > System > Notifications and switch off Do not disturb / Focus.'
        Write-Output '[CHECK] App notifications (START.md section 3): in the ChatGPT app open Settings > Notifications: turn completion = Always, permission = on, question = on. Phone: Settings > Connections > Control this PC > Set up, scan the QR code with the ChatGPT mobile app, allow its notifications.'
    }
}
else {
    # ---- D1. clone
    $cloneOk = $false
    if (-not $repoOk -or -not $git) { Say 'FAIL' 'cannot continue to the clone: fix the lines above and run this again' }
    elseif ([IO.Directory]::Exists((Join-Path $mainClone '.git')) -or [IO.File]::Exists((Join-Path $mainClone '.git'))) {
        $remote = (Invoke-Exe -File $git -Arguments @('remote', 'get-url', 'origin') -WorkDir $mainClone).Out
        $cloneOk = $true
        Say 'PASS' "competition clone exists: $mainClone"
        $expectedRemote = '^(?:https?://github\.com/|ssh://git@github\.com/|git@github\.com:)' + [regex]::Escape($Repo) + '(?:\.git)?/?$'
        if (-not $offline -and $remote -notmatch $expectedRemote) { $cloneOk = $false; Say 'FAIL' "$mainClone does not point at $Repo. Move that folder away and run this again." }
    }
    elseif ([IO.Directory]::Exists($mainClone) -and @([IO.Directory]::GetFileSystemEntries($mainClone)).Count -gt 0) { Say 'FAIL' "$mainClone exists, is not empty and is not a git clone. Move it away and run this again." }
    else {
        $clone = Invoke-Exe -File $git -Arguments @('clone', $repoUrl, $mainClone) -TimeoutSec 300
        if ($clone.ExitCode -eq 0) { $cloneOk = $true; Say 'PASS' "cloned into $mainClone" } else { Say 'FAIL' "git clone failed: $(Short $clone.Err)" }
    }

    # ---- D2. baseline: the first commit of the competition repo (planning work only, no application code)
    $mainReady = $false
    if ($cloneOk) {
        [void](Invoke-Exe -File $git -Arguments @('fetch', 'origin', '--prune') -WorkDir $mainClone -TimeoutSec 120)
        $hasMain = ((Invoke-Exe -File $git -Arguments @('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main') -WorkDir $mainClone).ExitCode -eq 0)
        if (-not $hasMain -and $Baseline) {
            try {
                [void](Invoke-Exe -File $git -Arguments @('symbolic-ref', 'HEAD', 'refs/heads/main') -WorkDir $mainClone)
                $copied = Copy-Baseline -Git $git -Destination $mainClone -Team $team
                [void](Invoke-Exe -File $git -Arguments @('add', '-A') -WorkDir $mainClone -TimeoutSec 120)
                $staged = (Invoke-Exe -File $git -Arguments @('diff', '--cached', '--name-only') -WorkDir $mainClone).Out
                $bad = @($staged -split "`n" | Where-Object { $_ -match '(?i)secrets|\.env\.local|openai-check|papi-ref|node_modules' })
                if ($bad.Count -gt 0) { throw "refusing to commit: files that must not be in the baseline are staged ($(Short ($bad -join ', ') 160))" }
                $commit = Invoke-Exe -File $git -Arguments @('commit', '-m', 'chore: baseline - prior planning work only, no application code', '-m', 'Prior work declared: planning docs, prompts, contracts.ts (types and specs, no implementation), build specs under docs/specs, board and alert scripts, Codex hooks and config. Not included: tools/openai-check, anything from a company codebase. All application code is written during the event.') -WorkDir $mainClone
                if ($commit.ExitCode -ne 0) { throw "git commit failed: $(Short ($commit.Err + ' ' + $commit.Out))" }
                $push = Invoke-Exe -File $git -Arguments @('push', '-u', 'origin', 'main') -WorkDir $mainClone -TimeoutSec 180
                if ($push.ExitCode -ne 0) { throw "git push failed: $(Short $push.Err)" }
                [void](Invoke-Exe -File $git -Arguments @('fetch', 'origin') -WorkDir $mainClone -TimeoutSec 120)
                $sha = (Invoke-Exe -File $git -Arguments @('rev-parse', '--short', 'origin/main') -WorkDir $mainClone).Out
                $hasMain = $true
                Say 'PASS' "baseline pushed: $($copied.Files) files, commit $sha  (write this SHA into SOURCE-BASELINE.md later)"
                if ($copied.PlaceholdersLeft -gt 0) { Say 'WARN' "$($copied.PlaceholdersLeft) REPLACE_*_LOGIN / _NAME placeholders are still in prompts (team.json incomplete). Alerts still work; @mentions on GitHub will not notify anyone." }
            }
            catch { Say 'FAIL' "baseline: $($_.Exception.Message)" }
        }
        if (-not $hasMain -and -not $Baseline) {
            $deadline = [DateTime]::UtcNow.AddMinutes($WaitMinutes)
            Say 'WAIT' "origin/main has no baseline yet (person C pushes it at 10:00); checking every 20 s for up to $WaitMinutes min"
            while (-not $hasMain -and [DateTime]::UtcNow -lt $deadline) {
                Start-Sleep -Seconds 20
                [void](Invoke-Exe -File $git -Arguments @('fetch', 'origin', '--prune') -WorkDir $mainClone -TimeoutSec 120)
                $hasMain = ((Invoke-Exe -File $git -Arguments @('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main') -WorkDir $mainClone).ExitCode -eq 0)
            }
            if (-not $hasMain) { Say 'HUMAN' "Still no baseline on $Repo after $WaitMinutes min. Ask C to run: start-day.ps1 -Person C -Mode Day -Baseline   then run this again." }
        }
        if ($hasMain) {
            $tree = (Invoke-Exe -File $git -Arguments @('ls-tree', '--name-only', 'origin/main') -WorkDir $mainClone).Out
            if ($tree -match '(?m)^AGENTS\.md$' -and $tree -match '(?m)^prompts$' -and $tree -match '(?m)^tools$') { $mainReady = $true; Say 'PASS' ('origin/main has the baseline (' + (Invoke-Exe -File $git -Arguments @('rev-parse', '--short', 'origin/main') -WorkDir $mainClone).Out + ')') }
            else { Say 'FAIL' 'origin/main exists but has no AGENTS.md / prompts / tools: the baseline is incomplete. Ask C before going on.' }
        }
    }

    # ---- D3. four worktrees + .lane
    $lanes = @("${Person}0", "${Person}1", "${Person}2", "${Person}3")
    $worktreesOk = $false
    if ($mainReady) {
        $common = (Invoke-Exe -File $git -Arguments @('rev-parse', '--git-common-dir') -WorkDir $mainClone).Out
        if (-not [IO.Path]::IsPathRooted($common)) { $common = Join-Path $mainClone $common }
        $exclude = Join-Path $common 'info\exclude'
        try {
            [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($exclude))
            $have = ''
            if ([IO.File]::Exists($exclude)) { $have = [IO.File]::ReadAllText($exclude) }
            foreach ($entry in '.lane', '.team-board/', 'handoff/') { if ($have -notmatch ('(?m)^' + [regex]::Escape($entry) + '\s*$')) { [IO.File]::AppendAllText($exclude, "`n$entry`n") } }
        }
        catch { Say 'WARN' 'could not update .git/info/exclude (.lane may show up in git status until setup adds .gitignore)' }
        $made = 0
        $mainCommon = (Invoke-Exe -File $git -Arguments @('rev-parse', '--path-format=absolute', '--git-common-dir') -WorkDir $mainClone).Out
        foreach ($lane in $lanes) {
            $path = Join-Path $Root ('nless-' + $lane.ToLowerInvariant())
            if (-not [IO.Directory]::Exists($path)) {
                $add = Invoke-Exe -File $git -Arguments @('worktree', 'add', '--detach', $path, 'origin/main') -WorkDir $mainClone -TimeoutSec 180
                if ($add.ExitCode -ne 0) { Say 'FAIL' "git worktree add $path : $(Short $add.Err)"; continue }
            }
            else {
                $laneCommon = Invoke-Exe -File $git -Arguments @('rev-parse', '--path-format=absolute', '--git-common-dir') -WorkDir $path
                if ($laneCommon.ExitCode -ne 0 -or -not $mainCommon -or $laneCommon.Out -ne $mainCommon) { Say 'FAIL' "$path is not a worktree of the competition clone. Move it aside before rerunning setup."; continue }
            }
            if (-not [IO.File]::Exists((Join-Path $path 'AGENTS.md'))) {
                # Created before the baseline existed: move it onto origin/main when it has no work of its own.
                $dirty = (Invoke-Exe -File $git -Arguments @('status', '--porcelain') -WorkDir $path).Out
                if (-not $dirty) { [void](Invoke-Exe -File $git -Arguments @('checkout', '--detach', 'origin/main') -WorkDir $path) }
            }
            try { [IO.File]::WriteAllText((Join-Path $path '.lane'), $lane) } catch { Say 'FAIL' "cannot write $path\.lane"; continue }
            if ([IO.File]::Exists((Join-Path $path 'tools\team-board.ps1'))) { $made++ } else { Say 'FAIL' "$path has no tools\team-board.ps1 (not on the baseline). Run: git -C `"$path`" checkout --detach origin/main" }
        }
        if ($made -eq 4) { $worktreesOk = $true; Say 'PASS' ("4 worktrees ready with .lane: " + (($lanes | ForEach-Object { 'nless-' + $_.ToLowerInvariant() }) -join ', ')) }
    }

    # ---- D4. board check from the orchestrator worktree
    $boardOk = $offline
    if ($worktreesOk -and -not $offline) {
        $orchestrator = Join-Path $Root "nless-${p}0"
        $check = Invoke-Exe -File 'powershell' -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $orchestrator 'tools\team-board.ps1'), 'check') -WorkDir $orchestrator -TimeoutSec 90
        $expectedBoard = [regex]::Escape("https://github.com/$Repo/issues/$([int]$team.boardIssue)")
        $boardOk = $check.ExitCode -eq 0 -and $check.Out -match "(?m)^Board: $expectedBoard state=open private=False\s*$" -and $check.Out -match '(?m)^Team logins: 3 configured\b'
        if ($boardOk) { Say 'PASS' ("public board verified: " + (Short (($check.Out -split "`n" | Where-Object { $_ -match '^(Board|Team logins)' }) -join ' | ') 300)) }
        else { Say 'HUMAN' ("Board check failed: " + (Short ($check.Err + ' ' + $check.Out) 240) + "  -> check BOARD_REPO / BOARD_ISSUE / BOARD_TEAM_LOGINS in $secretsPath and any shell overrides. Do not activate hooks until the intended public board passes.") }
    }

    # ---- D5. what the person does now
    if ($worktreesOk -and $boardOk) {
        $lines = New-Object System.Collections.ArrayList
        [void]$lines.Add("ENDLESS - person $Person - what to do now (about 3 minutes)")
        [void]$lines.Add('')
        [void]$lines.Add('In the ChatGPT app (Codex), for EACH folder below: Add new project (Ctrl+O) > pick the folder > Trust > New chat >')
        [void]$lines.Add('Work in: This computer (NOT Worktree) > model GPT-6.2 Sol > the effort and Fast shown > Approve for me > Review hooks: trust all 3')
        [void]$lines.Add('> then type the ONE line shown. Do them in this order.')
        [void]$lines.Add('')
        $rows = @()
        if ($Person -eq 'C') {
            $rows += , @('C1', 'Medium', 'Fast ON', 'You are C1. Open prompts/C1-setup.md and do exactly what the text block under "1. Prompt" says, as if I had pasted it here. Start now.')
            $rows += , @('C0', 'High', 'Fast off (ON from SETUP READY to 13:00)', 'You are C0. Open prompts/orchestrators/C0.md and do exactly what its text block says, as if I had pasted it here. Start now.')
            $rows += , @('C2', 'Medium', 'Fast ON until 13:00', 'You are C2. Open prompts/lanes/C2.md and do exactly what its text block says, as if I had pasted it here. Start now.')
            $rows += , @('C3', 'Medium', 'Fast off', 'You are C3. Open prompts/lanes/C3.md and do exactly what its text block says, as if I had pasted it here. Start now.')
        }
        else {
            $fast = @{ A1 = 'Fast ON until 13:00'; A2 = 'Fast off'; A3 = 'Fast off'; B1 = 'Fast ON until 13:00'; B2 = 'Fast ON until 13:00'; B3 = 'Fast off' }
            $rows += , @("${Person}0", 'High', 'Fast off (ON from SETUP READY to 13:00)', "You are ${Person}0. Open prompts/orchestrators/${Person}0.md and do exactly what its text block says, as if I had pasted it here. Start now.")
            foreach ($n in 1..3) { $lane = "$Person$n"; $rows += , @($lane, 'Medium', $fast[$lane], "You are $lane. Open prompts/lanes/$lane.md and do exactly what its text block says, as if I had pasted it here. Start now.") }
        }
        foreach ($row in $rows) {
            [void]$lines.Add(('{0}   folder: {1}   effort: {2}   {3}' -f $row[0], (Join-Path $Root ('nless-' + $row[0].ToLowerInvariant())), $row[1], $row[2]))
            [void]$lines.Add('     type:  ' + $row[3])
            [void]$lines.Add('')
        }
        if ($Person -eq 'C') { [void]$lines.Add('C1 FIRST: the whole team waits for its SETUP READY post (target 10:50, latest 11:00). After the first production deploy, open a NEW chat') ; [void]$lines.Add('in nless-c1 and type: You are C1. Open prompts/lanes/C1.md and do exactly what its text block says, as if I had pasted it here. Start now.'); [void]$lines.Add('') }
        [void]$lines.Add('Optional: open a terminal in ' + (Join-Path $Root "nless-${p}0") + ' as a second screen (every board post; beeps on BLOCKED and on posts that mention you):')
        [void]$lines.Add('  while ($true) { powershell -NoProfile -ExecutionPolicy Bypass -File tools\team-board.ps1 watch -AgentId LEAD -DurationSeconds 3600 }')
        [void]$lines.Add('A chat that needs you ends its turn with a line that starts with a red stop sign: the ChatGPT app notifies you here and on your')
        [void]$lines.Add('paired phone, and this PC beeps. App settings: Notifications > turn completion Always, permission on, question on.')
        [void]$lines.Add('Full page: START.md   Your day: prompts/people/' + $Person + '.md   If something breaks: docs/day/failure-drills.md')
        $sheet = Join-Path $Root "nless-START-$Person.txt"
        try { [IO.File]::WriteAllLines($sheet, [string[]]$lines, [Text.UTF8Encoding]::new($false)) } catch { }
        Write-Output ''
        foreach ($line in $lines) { Write-Output $line }
        Write-Output "(saved to $sheet)"
    }
}

# ---------------------------------------------------------------- summary
Write-Output ''
if ($script:Fails -eq 0 -and $script:Humans.Count -eq 0) {
    Write-Output "== READY: person $Person, mode $Mode, nothing left for a human in this step =="
    if ($Mode -eq 'Day') { Send-Human "Person ${Person}: worktrees are ready. Open the 4 projects and type the 4 lines (nless-START-$Person.txt)." 'info' }
    exit 0
}
Write-Output "== NOT READY: $($script:Fails) FAIL, $($script:Humans.Count) step(s) for a human =="
$index = 0
foreach ($item in $script:Humans) { $index++; Write-Output ("  {0}. {1}" -f $index, $item) }
Send-Human "Person $Person ($Mode): $($script:Fails) FAIL and $($script:Humans.Count) step(s) need you. Look at the Codex chat."
exit 1
