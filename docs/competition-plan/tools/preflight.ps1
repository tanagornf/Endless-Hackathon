# Readiness check for a hackathon PC (D16). Run it tonight on every PC and post the table to the team before bed.
#   powershell -NoProfile -ExecutionPolicy Bypass -File docs\competition-plan\tools\preflight.ps1 [-OpenAI] [-SecretsFile <path>] [-AsJson]
# Prints a PASS / WARN / FAIL (and INFO) table and exits 1 when any row is FAIL. Windows PowerShell 5.1 compatible, ASCII only.
# It never logs in, never installs system software, never starts services and never prints a secret value (key NAMES only).
# It does create/drop one scratch database (nless_probe_<random>) on PG_SERVER_URL and, only with -OpenAI, spends about US$0.08.
#   -OpenAI      also run the OpenAI smoke through tools/openai-check (npm ci; npm run check text) with the key from the secrets file
#   -SkipDb      skip the database probe
#   -SecretsFile secrets file to check (default: ..\nless.secrets.env next to this repo)
[CmdletBinding()]
param(
    [switch]$OpenAI,
    [switch]$SkipDb,
    [string]$SecretsFile = '',
    [switch]$AsJson
)
$ErrorActionPreference = 'Continue'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$rows = New-Object System.Collections.ArrayList

function Add-Row {
    param([string]$Check, [ValidateSet('PASS', 'WARN', 'FAIL', 'INFO')][string]$Status, [string]$Detail)
    $clean = ([string]$Detail -replace '\s+', ' ').Trim()
    $clean = [regex]::Replace($clean, '(?i)(sk-|bearer\s+)[A-Za-z0-9_\-\.]{8,}', '${1}[REDACTED]')
    if ($clean.Length -gt 220) { $clean = $clean.Substring(0, 217) + '...' }
    [void]$rows.Add([pscustomobject]@{ Check = $Check; Status = $Status; Detail = $clean })
}

function Invoke-Tool {
    # Runs a program with captured output and a timeout. $Environment adds variables for the child only.
    param([string]$File, [string[]]$Arguments = @(), [string]$WorkingDirectory = $repoRoot, [hashtable]$Environment = @{}, [int]$TimeoutSec = 120)
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = $File
    $quoted = @()
    foreach ($a in $Arguments) { if ($a -match '[\s"]') { $quoted += '"' + ($a -replace '"', '\"') + '"' } else { $quoted += $a } }
    $psi.Arguments = ($quoted -join ' ')
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.RedirectStandardInput = $true
    $psi.CreateNoWindow = $true
    foreach ($key in $Environment.Keys) { $psi.EnvironmentVariables[$key] = [string]$Environment[$key] }
    try { $proc = [Diagnostics.Process]::Start($psi) }
    catch { return [pscustomobject]@{ ExitCode = -1; Out = ''; Err = $_.Exception.Message; TimedOut = $false } }
    $proc.StandardInput.Close()
    $outTask = $proc.StandardOutput.ReadToEndAsync()
    $errTask = $proc.StandardError.ReadToEndAsync()
    $timedOut = $false
    if (-not $proc.WaitForExit($TimeoutSec * 1000)) { $timedOut = $true; try { $proc.Kill() } catch { } }
    $proc.WaitForExit()
    return [pscustomobject]@{ ExitCode = $(if ($timedOut) { -2 } else { $proc.ExitCode }); Out = $outTask.Result; Err = $errTask.Result; TimedOut = $timedOut }
}

function Find-Exe {
    param([string]$Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $cmd) { return $null }
    return $cmd.Source
}

function Read-EnvNames {
    # Returns @{ NAME = $true } for the keys with a non-empty value, and the values only through $script:SecretValues (never printed).
    param([string]$Path)
    $present = @{}
    $script:SecretValues = @{}
    foreach ($line in [IO.File]::ReadAllLines($Path, [Text.Encoding]::UTF8)) {
        $entry = $line.Trim()
        if ($entry.Length -eq 0 -or $entry.StartsWith('#')) { continue }
        if ($entry.StartsWith('export ')) { $entry = $entry.Substring(7).TrimStart() }
        $eq = $entry.IndexOf('=')
        if ($eq -lt 1) { continue }
        $name = $entry.Substring(0, $eq).Trim()
        $value = $entry.Substring($eq + 1).Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) { $value = $value.Substring(1, $value.Length - 2) }
        if ($value.Length -gt 0) { $present[$name] = $true; $script:SecretValues[$name] = $value }
    }
    return $present
}

# ---------- 1. PowerShell, Node, npm, git, gh ----------
$psv = $PSVersionTable.PSVersion
if ($psv.Major -gt 5 -or ($psv.Major -eq 5 -and $psv.Minor -ge 1)) { Add-Row 'PowerShell' 'PASS' "$psv" } else { Add-Row 'PowerShell' 'FAIL' "$psv (need 5.1 or newer)" }

$node = Find-Exe 'node'
if (-not $node) { Add-Row 'Node.js' 'FAIL' 'node not on PATH (install Node.js 24 LTS)' }
else {
    $v = (Invoke-Tool -File $node -Arguments @('--version') -TimeoutSec 20).Out.Trim()
    if ($v -match '^v24\.') { Add-Row 'Node.js' 'PASS' $v }
    elseif ($v -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22) { Add-Row 'Node.js' 'WARN' "$v (team standard is 24.x)" }
    else { Add-Row 'Node.js' 'FAIL' "$v (need 24.x)" }
}
$npmCmd = Find-Exe 'npm'
if (-not $npmCmd) { Add-Row 'npm' 'FAIL' 'npm not on PATH' }
else {
    $r = Invoke-Tool -File 'cmd.exe' -Arguments @('/d', '/c', 'npm', '--version') -TimeoutSec 60
    if ($r.ExitCode -eq 0) { Add-Row 'npm' 'PASS' $r.Out.Trim() } else { Add-Row 'npm' 'FAIL' "npm --version failed. If PowerShell blocks npm.ps1: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned" }
}

$git = Find-Exe 'git'
if (-not $git) { Add-Row 'git' 'FAIL' 'git not on PATH' }
else {
    $gv = (Invoke-Tool -File $git -Arguments @('--version') -TimeoutSec 20).Out.Trim()
    $lp = (Invoke-Tool -File $git -Arguments @('config', '--global', '--get', 'core.longpaths') -TimeoutSec 20).Out.Trim()
    Add-Row 'git' 'PASS' $gv
    if ($lp -eq 'true') { Add-Row 'git core.longpaths' 'PASS' 'true' } else { Add-Row 'git core.longpaths' 'FAIL' 'run: git config --global core.longpaths true' }
    $un = (Invoke-Tool -File $git -Arguments @('config', '--global', '--get', 'user.name') -TimeoutSec 20).Out.Trim()
    if ($un) { Add-Row 'git user.name' 'PASS' 'set' } else { Add-Row 'git user.name' 'WARN' 'git config --global user.name / user.email are empty (commits will fail)' }
}
$gh = Find-Exe 'gh'
if (-not $gh) { Add-Row 'GitHub CLI' 'FAIL' 'gh not on PATH (install GitHub CLI, then gh auth login)' }
else {
    $r = Invoke-Tool -File $gh -Arguments @('auth', 'status') -TimeoutSec 40
    if ($r.ExitCode -eq 0) { Add-Row 'gh auth status' 'PASS' 'logged in' } else { Add-Row 'gh auth status' 'FAIL' 'not logged in: run gh auth login' }
}

# ---------- 2. Machine: RAM, disk, power ----------
try {
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    $totalGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    $freeGb = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    if ($totalGb -lt 16) { Add-Row 'RAM' 'WARN' "$totalGb GB total, $freeGb GB free (under 16 GB: run at most 2 local dev servers, test more on production)" }
    elseif ($freeGb -lt 4) { Add-Row 'RAM' 'WARN' "$totalGb GB total but only $freeGb GB free: close apps before the day" }
    else { Add-Row 'RAM' 'PASS' "$totalGb GB total, $freeGb GB free" }
}
catch { Add-Row 'RAM' 'WARN' 'could not read memory info' }
try {
    $drive = New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($repoRoot))
    $freeDisk = [math]::Round($drive.AvailableFreeSpace / 1GB, 1)
    if ($freeDisk -lt 10) { Add-Row 'Disk' 'FAIL' "$freeDisk GB free on $($drive.Name) (need 10+ GB: 4 worktrees with node_modules, Playwright)" }
    elseif ($freeDisk -lt 25) { Add-Row 'Disk' 'WARN' "$freeDisk GB free on $($drive.Name)" }
    else { Add-Row 'Disk' 'PASS' "$freeDisk GB free on $($drive.Name)" }
}
catch { Add-Row 'Disk' 'WARN' 'could not read disk info' }
try {
    $pc = (Invoke-Tool -File 'powercfg.exe' -Arguments @('/query', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE') -TimeoutSec 20).Out
    $hex = @([regex]::Matches($pc, '0x[0-9a-fA-F]{8}') | ForEach-Object { $_.Value })
    if ($hex.Count -ge 2) {
        $ac = [Convert]::ToInt64($hex[$hex.Count - 2], 16)
        if ($ac -eq 0) { Add-Row 'Sleep on AC power' 'PASS' 'never' } else { Add-Row 'Sleep on AC power' 'WARN' "sleeps after $([int]($ac / 60)) min: powercfg /change standby-timeout-ac 0 (docs/day/chatgpt-app-setup.md)" }
    }
    else { Add-Row 'Sleep on AC power' 'WARN' 'could not read the power plan' }
}
catch { Add-Row 'Sleep on AC power' 'WARN' 'could not read the power plan' }

# ---------- 3. Codex app files ----------
$codexHome = Join-Path $env:USERPROFILE '.codex'
if ([IO.File]::Exists((Join-Path $codexHome 'AGENTS.md'))) { Add-Row 'Global AGENTS.md' 'WARN' "$codexHome\AGENTS.md exists: remove or rename it before the day (it is added to every lane and eats the 64 KiB doc budget)" } else { Add-Row 'Global AGENTS.md' 'PASS' 'none' }
$userConfig = Join-Path $codexHome 'config.toml'
if ([IO.File]::Exists($userConfig)) {
    $cfg = [IO.File]::ReadAllText($userConfig)
    $problems = @()
    if ($cfg -notmatch '(?m)^\s*model\s*=\s*"gpt-6\.2-sol"') { $problems += 'model is not gpt-6.2-sol' }
    if ($cfg -match '(?m)^\s*model\s*=\s*"[^"]*astra') { $problems += 'ASTRA model set' }
    if ($cfg -notmatch '(?m)^\s*approvals_reviewer\s*=\s*"auto_review"') { $problems += 'approvals_reviewer missing' }
    if ($cfg -notmatch '(?m)^\s*project_doc_max_bytes\s*=\s*(\d+)' -or [int]$Matches[1] -lt 49152) { $problems += 'project_doc_max_bytes under 48 KiB' }
    if ($problems.Count -eq 0) { Add-Row 'Codex user config' 'PASS' 'model, approvals_reviewer, project_doc_max_bytes ok' } else { Add-Row 'Codex user config' 'WARN' ($problems -join '; ') }
}
else { Add-Row 'Codex user config' 'WARN' "$userConfig not found (copy templates/codex/user/config.toml)" }
if ([IO.File]::Exists((Join-Path $codexHome 'rules\default.rules'))) { Add-Row 'Codex rules' 'PASS' 'rules\default.rules present' } else { Add-Row 'Codex rules' 'WARN' 'rules\default.rules not found (copy templates/codex/user/default.rules)' }
try {
    $pkg = @(Get-AppxPackage -Name '*ChatGPT*' -ErrorAction Stop)
    if ($pkg.Count -gt 0) { Add-Row 'ChatGPT desktop app' 'PASS' "$($pkg[0].Name) $($pkg[0].Version)" } else { Add-Row 'ChatGPT desktop app' 'WARN' 'no ChatGPT package found (UNCONFIRMED package name; check Start menu)' }
}
catch { Add-Row 'ChatGPT desktop app' 'WARN' 'could not list installed apps' }
$pw = @(Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'ms-playwright') -Filter 'chromium-*' -Directory -ErrorAction SilentlyContinue)
if ($pw.Count -gt 0) { Add-Row 'Playwright Chromium' 'PASS' $pw[0].Name } else { Add-Row 'Playwright Chromium' 'WARN' 'not installed: npx playwright install chromium' }

# ---------- 4. Secrets file (names only) ----------
if ([string]::IsNullOrWhiteSpace($SecretsFile)) { $SecretsFile = Join-Path (Split-Path $repoRoot -Parent) 'nless.secrets.env' }
$script:SecretValues = @{}
$present = @{}
if (-not [IO.File]::Exists($SecretsFile)) { Add-Row 'Secrets file' 'FAIL' "not found: $SecretsFile (create ..\nless.secrets.env next to the repos)" }
else {
    $present = Read-EnvNames -Path $SecretsFile
    Add-Row 'Secrets file' 'PASS' "found, $($present.Count) keys with a value"
    $required = [ordered]@{
        OPENAI_API_KEY = 'FAIL'; PG_SERVER_URL = 'FAIL'; BOARD_REPO = 'FAIL'; BOARD_ISSUE = 'FAIL'; BOARD_TEAM_LOGINS = 'FAIL'
        SITES_URL = 'WARN'; SITES_BYPASS_TOKEN = 'WARN'; BOARD_SECRET = 'WARN'; BOARD_SOURCE = 'INFO'
    }
    foreach ($name in $required.Keys) {
        if ($present.ContainsKey($name)) { Add-Row "key $name" 'PASS' 'present' }
        else {
            $note = 'missing'
            if ($name -eq 'BOARD_SOURCE') { $note = 'missing (default sites; set github to force GitHub reads)' }
            if ($required[$name] -eq 'WARN' -and $name -ne 'BOARD_SOURCE') { $note = 'missing (board falls back to GitHub only)' }
            Add-Row "key $name" $required[$name] $note
        }
    }
    if ($present.ContainsKey('E2E_BASE_URL')) { Add-Row 'key E2E_BASE_URL' 'PASS' 'present' } else { Add-Row 'key E2E_BASE_URL' 'INFO' 'set after the first production deploy (about 11:30)' }
    foreach ($name in @('LINE_CHANNEL_ACCESS_TOKEN', 'META_APP_SECRET', 'GOOGLE_CLIENT_SECRET')) { if ($present.ContainsKey($name)) { Add-Row "key $name" 'INFO' 'present (provider key, only for the person who needs it)' } }
}

# ---------- 5. Board ----------
$board = Join-Path $PSScriptRoot 'team-board.ps1'
if (-not [IO.File]::Exists($board)) { Add-Row 'Board check' 'FAIL' 'team-board.ps1 not found next to preflight.ps1' }
elseif (-not ($present.ContainsKey('BOARD_REPO') -and $present.ContainsKey('BOARD_ISSUE'))) { Add-Row 'Board check' 'FAIL' 'skipped: BOARD_REPO / BOARD_ISSUE missing' }
elseif (-not $gh) { Add-Row 'Board check' 'FAIL' 'skipped: gh missing' }
else {
    $stateDir = Join-Path ([IO.Path]::GetTempPath()) ('nless-preflight-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    $r = Invoke-Tool -File 'powershell.exe' -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $board, 'check', '-AgentId', 'LEAD', '-SecretsFile', $SecretsFile, '-StateRoot', $stateDir) -TimeoutSec 90
    if ([IO.Directory]::Exists($stateDir)) { try { Remove-Item -LiteralPath $stateDir -Recurse -Force } catch { } }
    $text = $r.Out + "`n" + $r.Err
    if ($r.ExitCode -ne 0) { $first = ($text -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -First 1); Add-Row 'Board check (GitHub issue)' 'FAIL' "team-board.ps1 check failed: $first" }
    else {
        Add-Row 'Board check (GitHub issue)' 'PASS' (($text -split "`r?`n" | Where-Object { $_ -match '^Board:' } | Select-Object -First 1) -replace 'https?://\S+', '<issue url>')
        if ($text -match 'Sites: OK') { Add-Row 'Board check (Sites)' 'PASS' (($text -split "`r?`n" | Where-Object { $_ -match '^Sites: OK' } | Select-Object -First 1) -replace '\bat\s+\S+$', '') }
        elseif ($text -match 'Sites: not used') { Add-Row 'Board check (Sites)' 'WARN' 'Sites not configured: GitHub-only board' }
        else { Add-Row 'Board check (Sites)' 'WARN' 'Sites check FAILED: reads fall back to GitHub; test with docs/board/sites-dashboard.md section 4' }
        if ($text -match 'Sites people cards: OK') { Add-Row 'Board check (people cards)' 'PASS' 'GET /api/people works' }
        elseif ($text -match 'Sites people cards: UNAVAILABLE') { Add-Row 'Board check (people cards)' 'WARN' 'GET /api/people missing: the dashboard needs the STAGE person cards (docs/board/sites-dashboard.md)' }
    }
}

# ---------- 6. Database probe ----------
$dbDir = Join-Path $PSScriptRoot 'preflight-db'
if ($SkipDb) { Add-Row 'Database probe' 'INFO' 'skipped (-SkipDb)' }
elseif (-not $script:SecretValues.ContainsKey('PG_SERVER_URL')) { Add-Row 'Database probe' 'WARN' 'skipped: PG_SERVER_URL is not set in the secrets file (Neon direct endpoint, see docs/day/pc-preparation.md)' }
elseif (-not $node -or -not $npmCmd) { Add-Row 'Database probe' 'FAIL' 'skipped: node or npm missing' }
else {
    $ready = [IO.Directory]::Exists((Join-Path $dbDir 'node_modules\pg'))
    if (-not $ready) {
        $r = Invoke-Tool -File 'cmd.exe' -Arguments @('/d', '/c', 'npm', 'ci', '--no-audit', '--no-fund') -WorkingDirectory $dbDir -TimeoutSec 180
        $ready = ($r.ExitCode -eq 0)
        if (-not $ready) { Add-Row 'Database probe' 'FAIL' 'npm ci failed in tools\preflight-db (network?)' }
    }
    if ($ready) {
        $r = Invoke-Tool -File $node -Arguments @((Join-Path $dbDir 'probe.mjs')) -WorkingDirectory $dbDir -Environment @{ PG_SERVER_URL = $script:SecretValues['PG_SERVER_URL'] } -TimeoutSec 120
        $steps = @()
        foreach ($line in ($r.Out -split "`r?`n")) { if ($line.Trim().StartsWith('{')) { try { $steps += (ConvertFrom-Json -InputObject $line) } catch { } } }
        if ($steps.Count -eq 0) { Add-Row 'Database probe' 'FAIL' "no result (exit $($r.ExitCode)) $($r.Err)" }
        else {
            foreach ($s in $steps) {
                $label = 'DB ' + $s.step
                if ($s.ok) { Add-Row $label 'PASS' "$($s.detail) ($($s.ms) ms)" } else { Add-Row $label 'FAIL' "$($s.detail)" }
            }
            $slow = @($steps | Where-Object { $_.step -eq 'connect-server' -and $_.ms -gt 4000 })
            if ($slow.Count -gt 0) { Add-Row 'DB latency' 'WARN' "first connect took $($slow[0].ms) ms (Neon cold start or slow network; fallback: WSL2 Postgres 16 + pgvector)" }
        }
    }
}

# ---------- 7. OpenAI smoke (optional, spends about US$0.08) ----------
$openaiDir = Join-Path $repoRoot 'tools\openai-check'
if (-not $OpenAI) { Add-Row 'OpenAI smoke' 'INFO' 'skipped (pass -OpenAI to run tools/openai-check, about US$0.08 on your own key)' }
elseif (-not $present.ContainsKey('OPENAI_API_KEY')) { Add-Row 'OpenAI smoke' 'FAIL' 'skipped: OPENAI_API_KEY missing' }
elseif (-not [IO.Directory]::Exists($openaiDir)) { Add-Row 'OpenAI smoke' 'FAIL' 'tools\openai-check not found (run from the planning repo)' }
else {
    $envs = @{ NLESS_SECRETS_FILE = $SecretsFile }
    $r = Invoke-Tool -File 'cmd.exe' -Arguments @('/d', '/c', 'npm', 'ci', '--no-audit', '--no-fund') -WorkingDirectory $openaiDir -Environment $envs -TimeoutSec 240
    if ($r.ExitCode -ne 0) { Add-Row 'OpenAI smoke' 'FAIL' 'npm ci failed in tools\openai-check' }
    else {
        # The vision and PDF checks (T11-T13) read git-ignored synthetic files from fixtures\. Make them first (npm run fixtures = Python + Pillow).
        $fixtureNames = @('slip-th.png', 'product-latte.png', 'price-list-th.pdf')
        $missing = @($fixtureNames | Where-Object { -not [IO.File]::Exists((Join-Path $openaiDir "fixtures\$_")) })
        if ($missing.Count -gt 0) {
            [void](Invoke-Tool -File 'cmd.exe' -Arguments @('/d', '/c', 'npm', 'run', 'fixtures') -WorkingDirectory $openaiDir -Environment $envs -TimeoutSec 120)
            $missing = @($fixtureNames | Where-Object { -not [IO.File]::Exists((Join-Path $openaiDir "fixtures\$_")) })
        }
        if ($missing.Count -gt 0) { Add-Row 'OpenAI smoke' 'FAIL' ("not run, no money spent: 'npm run fixtures' in tools\openai-check could not make " + ($missing -join ', ') + '. It needs Python with Pillow (py -m pip install pillow); then run again.') }
        else {
            $r = Invoke-Tool -File 'cmd.exe' -Arguments @('/d', '/c', 'npm', 'run', 'check', 'text') -WorkingDirectory $openaiDir -Environment $envs -TimeoutSec 240
            $lastLine = ($r.Out -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -Last 1)
            if ($r.ExitCode -eq 0) { Add-Row 'OpenAI smoke' 'PASS' "npm run check text: $lastLine" } else { Add-Row 'OpenAI smoke' 'FAIL' "npm run check text failed (exit $($r.ExitCode)): $lastLine" }
        }
    }
}

# ---------- output ----------
$fails = @($rows | Where-Object { $_.Status -eq 'FAIL' }).Count
$warns = @($rows | Where-Object { $_.Status -eq 'WARN' }).Count
$passes = @($rows | Where-Object { $_.Status -eq 'PASS' }).Count
if ($AsJson) { [pscustomobject]@{ checkedAtUtc = [DateTime]::UtcNow.ToString('o'); pass = $passes; warn = $warns; fail = $fails; rows = $rows } | ConvertTo-Json -Depth 4 }
else {
    $rows | Format-Table -AutoSize -Wrap | Out-String -Width 200 | Write-Output
    Write-Output "PASS $passes   WARN $warns   FAIL $fails   (machine: $env:COMPUTERNAME, $([DateTime]::Now.ToString('yyyy-MM-dd HH:mm')))"
    if ($fails -gt 0) { Write-Output 'NOT READY: fix every FAIL, run again, then post this table to the team.' } else { Write-Output 'READY (read each WARN). Post this table to the team before bed.' }
}
exit $(if ($fails -gt 0) { 1 } else { 0 })
