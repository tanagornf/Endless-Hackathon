# Shared helpers for the team-board Codex hooks (session-start.ps1, user-prompt.ps1, stop.ps1).
# Keep this file ASCII only: Windows PowerShell 5.1 reads BOM-less scripts in the ANSI code page.
#
# Contract for every hook:
#   - never block or break Codex because of the board: on any board error print ONE warning line to stderr and exit 0
#   - never print secrets (tools/team-board.ps1 already redacts; warnings here are redacted again)
#   - keep model-visible output short (about 1,500 characters; the full text is saved under .team-board/)
#   - do nothing at all when the session is not inside a lane worktree (no .lane file)

$script:HookOutputLimit = 1500
$script:HookFreezeFile = 'hook-freeze.txt'
# Same classification as Get-BoardPostType in tools/team-board.ps1: "[<author>] LEAD: FREEZE ..." at the start of a post line.
$script:HookFreezePattern = '(?m)^\[[A-Za-z0-9_-]{1,40}(?:/Codex)?\]\s*LEAD:\s*FREEZE\b'
$script:HookDeployFreezePattern = '(?m)^\[[A-Za-z0-9_-]{1,40}(?:/Codex)?\]\s*DEPLOY\s+FREEZE\b'
# Orchestrators (A0 B0 C0) owe a STAGE post every 30 minutes (D9). The Stop hook reminds them from local files only:
#   .team-board/last-stage.txt     written by team-board.ps1 when this lane posts STAGE (UTC, ISO 8601)
#   .team-board/orch-start.txt     baseline, written the first time a hook runs for the orchestrator (used until the first STAGE)
#   .team-board/stage-reminded.txt written when a reminder was sent; at most one reminder every 10 minutes
$script:HookStageMinutes = 30
$script:HookStageRemindMinutes = 10
# Heartbeat: Codex stops for good when a Stop hook returns without a decision, and a stopped chat hears no board post until a
# person types in it. So after a quiet wait window the Stop hook continues the chat with a one-line "nothing new" prompt and
# listens again. .team-board/heartbeat.txt counts the quiet windows in a row; a real post or a human prompt resets it.
$script:HookHeartbeatFile = 'heartbeat.txt'

function Write-HookWarning {
    param([string]$Message)
    $text = ([string]$Message -replace '\s+', ' ').Trim()
    $text = [regex]::Replace($text, '(?i)(bearer\s+)\S+', '${1}[REDACTED]')
    # Defense in depth (the board already redacts its own secrets): hide long token-like runs such as a 64-hex BOARD_SECRET.
    $text = [regex]::Replace($text, '[A-Za-z0-9_+=]{32,}', '[REDACTED]')
    if ($text.Length -gt 300) { $text = $text.Substring(0, 300) + '...' }
    try { [Console]::Error.WriteLine("WARNING: team-board hook: $text") } catch { }
}

function Write-HookStdout {
    param([string]$Text)
    # Raw UTF-8 bytes: independent of the console code page, which would turn Thai into '?'.
    if ([string]::IsNullOrEmpty($Text)) { return }
    $bytes = (New-Object Text.UTF8Encoding $false).GetBytes($Text)
    $stdout = [Console]::OpenStandardOutput()
    $stdout.Write($bytes, 0, $bytes.Length)
    $stdout.Flush()
}

function Read-HookInput {
    # Codex sends one JSON object on stdin. Read raw bytes and decode as UTF-8 (a cwd may contain non-ASCII).
    try {
        if (-not [Console]::IsInputRedirected) { return $null }
        $buffer = New-Object IO.MemoryStream
        [Console]::OpenStandardInput().CopyTo($buffer)
        $raw = [Text.Encoding]::UTF8.GetString($buffer.ToArray()).Trim().TrimStart([char]0xFEFF).Trim()
        if ($raw.Length -eq 0) { return $null }
        return (ConvertFrom-Json -InputObject $raw)
    }
    catch { Write-HookWarning "could not parse the hook input JSON; continuing without it. $($_.Exception.Message)"; return $null }
}

function Find-HookLaneRoot {
    param([string]$Start)
    # Walk up from the session cwd to the worktree root that holds .lane. Stop at the git root (.git folder or file),
    # so the main clone (no .lane) and unrelated folders get no board traffic at all.
    try { $directory = New-Object IO.DirectoryInfo ([IO.Path]::GetFullPath($Start)) } catch { return $null }
    while ($null -ne $directory) {
        if ([IO.File]::Exists([IO.Path]::Combine($directory.FullName, '.lane'))) { return $directory.FullName }
        if (Test-Path -LiteralPath ([IO.Path]::Combine($directory.FullName, '.git'))) { return $null }
        $directory = $directory.Parent
    }
    return $null
}

function Initialize-BoardHook {
    param([string]$EventName)
    # Returns the hook context, or $null when the hook must stay silent (no .lane, bad lane, no board script).
    $hookInput = Read-HookInput
    $start = (Get-Location -PSProvider FileSystem).ProviderPath
    if ($null -ne $hookInput -and @($hookInput.PSObject.Properties.Name) -contains 'cwd') {
        $cwd = [string]$hookInput.cwd
        if (-not [string]::IsNullOrWhiteSpace($cwd) -and [IO.Directory]::Exists($cwd)) { $start = $cwd }
    }
    $root = Find-HookLaneRoot -Start $start
    if ($null -eq $root) { return $null }
    # A worktree can host several chats. Only the bound chat may consume its lane inbox.
    $sessionFile = [IO.Path]::Combine($root, '.team-board', 'hook-session.txt')
    if ([IO.File]::Exists($sessionFile)) {
        $owner = [IO.File]::ReadAllText($sessionFile).Trim()
        if ([string]::IsNullOrWhiteSpace($owner) -or $null -eq $hookInput -or
            [string]$hookInput.session_id -cne $owner -or
            ($hookInput.agent_id -and [string]$hookInput.agent_id -cne $owner)) { return $null }
    }
    $lane = ([IO.File]::ReadAllText([IO.Path]::Combine($root, '.lane'))).Trim().ToUpperInvariant()
    if ($lane -notmatch '^[ABC][0-3]$') {
        $shown = $lane; if ($shown.Length -gt 12) { $shown = $shown.Substring(0, 12) }
        Write-HookWarning ".lane must contain one of A0..C3 (found '$shown'); board hooks do nothing."
        return $null
    }
    $board = [IO.Path]::Combine($root, 'tools', 'team-board.ps1')
    if (-not [IO.File]::Exists($board)) { Write-HookWarning "tools/team-board.ps1 not found in $root; board hooks do nothing."; return $null }
    return [pscustomobject]@{ Input = $hookInput; Root = $root; Lane = $lane; Board = $board; State = [IO.Path]::Combine($root, '.team-board'); Event = $EventName }
}

function Get-HookSetting {
    param($Ctx, [string]$Name)
    # Hook-only settings (BOARD_STOP_CHAIN, BOARD_STOP_WAIT_SECONDS): the environment wins, else ..\nless.secrets.env
    # beside the worktree (same file and rule as tools/team-board.ps1). Only the named key is read; nothing is printed.
    $value = [Environment]::GetEnvironmentVariable($Name)
    if (-not [string]::IsNullOrWhiteSpace($value)) { return $value.Trim() }
    try {
        $file = [IO.Path]::GetFullPath([IO.Path]::Combine($Ctx.Root, '..', 'nless.secrets.env'))
        if (-not [IO.File]::Exists($file)) { return '' }
        foreach ($line in [IO.File]::ReadAllLines($file)) {
            $match = [regex]::Match($line, '^\s*(?:export\s+)?' + [regex]::Escape($Name) + '\s*=\s*(.*?)\s*$')
            if ($match.Success) { return $match.Groups[1].Value.Trim('"', "'") }
        }
    }
    catch { }
    return ''
}

function Invoke-HookBoard {
    param($Ctx, [string]$Mode, [hashtable]$Extra = @{})
    # Runs tools/team-board.ps1 in this process from the worktree root (it resolves .lane, ..\nless.secrets.env and
    # .team-board relative to the current folder). Returns its stdout lines, or $null after a warning when it failed.
    # The board's own stderr warnings (e.g. "Sites read failed; falling back to GitHub") are folded into ONE line.
    $previous = (Get-Location -PSProvider FileSystem).ProviderPath
    $originalPath = $env:PATH
    $originalError = [Console]::Error
    $captured = New-Object IO.StringWriter
    $failure = ''
    $result = $null
    try {
        [Console]::SetError($captured)
        Set-Location -LiteralPath $Ctx.Root
        # A running desktop app can inherit PATH before the GitHub CLI installer updates it.
        if ($env:ProgramFiles -and -not (Get-Command gh -CommandType Application -ErrorAction SilentlyContinue)) {
            $cliDir = Join-Path $env:ProgramFiles 'GitHub CLI'
            if ([IO.File]::Exists((Join-Path $cliDir 'gh.exe'))) {
                $env:PATH = $cliDir + [IO.Path]::PathSeparator + $originalPath
            }
        }
        $parameters = @{ AgentId = $Ctx.Lane }
        foreach ($key in $Extra.Keys) { $parameters[$key] = $Extra[$key] }
        $lines = @(& $Ctx.Board $Mode @parameters)
        $result = [string[]]@($lines | ForEach-Object { [string]$_ })
    }
    catch { $failure = [string]$_.Exception.Message }
    finally {
        $env:PATH = $originalPath
        [Console]::SetError($originalError)
        try { Set-Location -LiteralPath $previous } catch { }
    }
    $boardNotes = (@($captured.ToString() -split "`r?`n" | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() -replace '^WARNING:\s*', '' }) -join ' | ')
    if ($failure) {
        $message = "board $Mode for $($Ctx.Lane) failed; Codex continues without the board. $failure"
        if ($boardNotes) { $message += " | $boardNotes" }
        Write-HookWarning $message
        return $null
    }
    if ($boardNotes) { Write-HookWarning "board $Mode for $($Ctx.Lane): $boardNotes" }
    return , $result
}

function Get-HookPostText {
    param([string[]]$Lines)
    # The board prints 'No new posts.' when there is nothing; treat that (and blank output) as no posts.
    $text = (@($Lines) -join "`n").Trim()
    if ($text.Length -eq 0 -or $text -eq 'No new posts.') { return '' }
    return $text
}

function Limit-HookText {
    param($Ctx, [string]$Text, [string]$Name)
    if ($Text.Length -le $script:HookOutputLimit) { return $Text }
    $relative = ".team-board/hook-$Name.txt"
    $note = "`n[truncated to about $($script:HookOutputLimit) characters; full text in $relative]"
    try {
        [void][IO.Directory]::CreateDirectory($Ctx.State)
        [IO.File]::WriteAllText([IO.Path]::Combine($Ctx.State, "hook-$Name.txt"), $Text, (New-Object Text.UTF8Encoding $false))
    }
    catch { $note = "`n[truncated to about $($script:HookOutputLimit) characters; see the board issue for the full post]" }
    return $Text.Substring(0, $script:HookOutputLimit - $note.Length).TrimEnd() + $note
}

function Test-HookFrozen {
    param($Ctx)
    return [IO.File]::Exists([IO.Path]::Combine($Ctx.State, $script:HookFreezeFile))
}

function Save-HookFreeze {
    param($Ctx, [string]$Text)
    # Remembers LEAD: FREEZE for this worktree so the Stop hook no longer waits for posts afterwards.
    if ($Text -cnotmatch $script:HookFreezePattern) { return $false }
    try {
        [void][IO.Directory]::CreateDirectory($Ctx.State)
        [IO.File]::WriteAllText([IO.Path]::Combine($Ctx.State, $script:HookFreezeFile), [DateTime]::UtcNow.ToString('o'))
    }
    catch { Write-HookWarning "could not record LEAD: FREEZE in .team-board. $($_.Exception.Message)" }
    return $true
}

function Read-HookTime {
    param([string]$Path)
    try {
        if (-not [IO.File]::Exists($Path)) { return $null }
        $raw = [IO.File]::ReadAllText($Path).Trim()
        return [DateTime]::Parse($raw, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
    }
    catch { return $null }
}

function Write-HookTime {
    param($Ctx, [string]$Name, [DateTime]$Value)
    try {
        [void][IO.Directory]::CreateDirectory($Ctx.State)
        [IO.File]::WriteAllText([IO.Path]::Combine($Ctx.State, $Name), $Value.ToUniversalTime().ToString('o'))
    }
    catch { Write-HookWarning "could not write $Name in .team-board. $($_.Exception.Message)" }
}

function Test-HookOrchestrator {
    param($Ctx)
    return ($Ctx.Lane -match '^[ABC]0$')
}

function Get-HookStageSeconds {
    # Seconds until this orchestrator's next STAGE is due (<= 0 means due now); $null for a worker lane.
    # No network: it only reads the markers above. A reminder is sent at most every HookStageRemindMinutes.
    param($Ctx, [DateTime]$Now = [DateTime]::UtcNow)
    if (-not (Test-HookOrchestrator -Ctx $Ctx)) { return $null }
    $last = Read-HookTime -Path ([IO.Path]::Combine($Ctx.State, 'last-stage.txt'))
    if ($null -eq $last) {
        $last = Read-HookTime -Path ([IO.Path]::Combine($Ctx.State, 'orch-start.txt'))
        if ($null -eq $last) { Write-HookTime -Ctx $Ctx -Name 'orch-start.txt' -Value $Now; $last = $Now }
    }
    $due = $last.AddMinutes($script:HookStageMinutes)
    $reminded = Read-HookTime -Path ([IO.Path]::Combine($Ctx.State, 'stage-reminded.txt'))
    if ($null -ne $reminded) {
        $next = $reminded.AddMinutes($script:HookStageRemindMinutes)
        if ($next -gt $due) { $due = $next }
    }
    return [int][Math]::Ceiling(($due - $Now).TotalSeconds)
}

function Get-HookStageReminder {
    # Marks the reminder as sent and returns the text (the person letter comes from the lane: A0 -> A).
    param($Ctx, [DateTime]$Now = [DateTime]::UtcNow)
    $last = Read-HookTime -Path ([IO.Path]::Combine($Ctx.State, 'last-stage.txt'))
    $since = ''
    if ($null -ne $last) { $since = " Your last STAGE was $([int][Math]::Floor(($Now - $last).TotalMinutes)) minutes ago." }
    Write-HookTime -Ctx $Ctx -Name 'stage-reminded.txt' -Value $Now
    $person = $Ctx.Lane.Substring(0, 1)
    return "STAGE due (D9: every 30 minutes).$since Post it now: powershell -NoProfile -ExecutionPolicy Bypass -File tools/team-board.ps1 stage $person `"<HH:MM> done: ... - doing: ... - blocked: ... - next: ... - usage: NN%`" (max 400 characters, true state), then carry on with your duties."
}

function Get-HookNeedsHumanLine {
    # The line an agent writes when it needs a PERSON starts with the red stop sign (U+1F6D1) or with NEEDS-HUMAN.
    # Returns that line (at most 300 characters) from the last assistant message of the Stop input, or '' when there is none.
    param($Ctx)
    try {
        if ($null -eq $Ctx.Input -or @($Ctx.Input.PSObject.Properties.Name) -notcontains 'last_assistant_message') { return '' }
        $message = [string]$Ctx.Input.last_assistant_message
        if ([string]::IsNullOrWhiteSpace($message)) { return '' }
        $stopSign = [string][char]0xD83D + [string][char]0xDED1
        $match = [regex]::Match($message, ('(?m)^[\s>*#_`\-]*(?:' + [regex]::Escape($stopSign) + '|NEEDS[ -]HUMAN\b)[^\r\n]*'))
        if (-not $match.Success) { return '' }
        $line = $match.Value.Trim()
        if ($line.Length -gt 300) { $line = $line.Substring(0, 300) }
        return $line
    }
    catch { return '' }
}

function Send-HookHumanAlert {
    # Local beeps + Windows toast through tools/alert.ps1 (best effort; nothing goes to stdout, which must stay empty or JSON).
    param($Ctx, [string]$Text)
    try {
        $alert = [IO.Path]::Combine($Ctx.Root, 'tools', 'alert.ps1')
        if (-not [IO.File]::Exists($alert)) { return }
        [void](& $alert -Message @($Text) -Lane $Ctx.Lane | Out-String)
    }
    catch { }
}

function Get-HookHeartbeatLimit {
    # Quiet wait windows in a row that are bridged with a heartbeat (each costs one short model turn). After the limit Codex
    # stops and the ChatGPT app shows the chat as finished. BOARD_STOP_HEARTBEATS overrides (0 = off).
    # Default: orchestrators 60 (they must hear their workers all day), workers 8 (about 70 minutes of waiting).
    param($Ctx)
    $limit = 8
    if ($Ctx.Lane -match '^[ABC]0$') { $limit = 60 }
    $setting = Get-HookSetting -Ctx $Ctx -Name 'BOARD_STOP_HEARTBEATS'
    if ($setting -match '^\d{1,3}$') { $limit = [int]$setting }
    return $limit
}

function Reset-HookHeartbeat {
    param($Ctx)
    try { $path = [IO.Path]::Combine($Ctx.State, $script:HookHeartbeatFile); if ([IO.File]::Exists($path)) { [IO.File]::Delete($path) } } catch { }
}

function Step-HookHeartbeat {
    # Returns the heartbeat prompt for this quiet window, or '' when heartbeats are off or the limit is reached.
    param($Ctx, [int]$WaitSeconds)
    try {
        $limit = Get-HookHeartbeatLimit -Ctx $Ctx
        if ($limit -lt 1) { return '' }
        $path = [IO.Path]::Combine($Ctx.State, $script:HookHeartbeatFile)
        $count = 0
        if ([IO.File]::Exists($path)) { $text = ([IO.File]::ReadAllText($path)).Trim(); if ($text -match '^\d{1,4}$') { $count = [int]$text } }
        if ($count -ge $limit) { return '' }
        $count++
        [void][IO.Directory]::CreateDirectory($Ctx.State)
        [IO.File]::WriteAllText($path, [string]$count)
        $minutes = [Math]::Max(1, [int][Math]::Round($WaitSeconds / 60.0))
        return "Team board heartbeat $count/$limit for lane $($Ctx.Lane): no new posts in the last $minutes minute(s). Nothing changed: do not run tools and do not start new work. Reply with the single word waiting and end your turn; the Stop hook keeps listening for posts."
    }
    catch { return '' }
}
