# Codex Stop hook: wait on the team board and continue Codex only when a post for this lane arrives
# (TO:<lane>, TASK, FIX, SETUP READY, LEAD: OPEN, LEAD: FREEZE, DEPLOY FREEZE; an orchestrator also wakes for its workers' DONE / BLOCKED /
# NEED / FIX / CHANGE and for GATE results - the filter of tools/team-board.ps1).
# stdout is either empty (Codex stops) or exactly one JSON line {"decision":"block","reason":"<posts>"}.
# Team default: keep waiting even when stop_hook_active is true, so a lane wakes for every new post all day
# (no endless loop: each wake needs a genuinely new post). BOARD_STOP_CHAIN=0 restores Codex's once-per-prompt rule.
# Codex stops at once when there is no .lane or the board fails. After LEAD: FREEZE (hook-freeze.txt) the hook keeps waiting, but the
# board is asked with -Frozen: workers then wake only for TASK / FIX / DONE FIX / GATE / DEPLOY FREEZE posts (no new features).
# Orchestrators (A0 B0 C0) are also woken when 30 minutes passed since their last STAGE post (local markers, no extra network call).
# Wait window: BOARD_STOP_WAIT_SECONDS (default 540, max 560; keep it under the hook timeout of 600).
# Both settings: environment first, else ..\nless.secrets.env. ASCII only (PS 5.1).
# A quiet wait window does not leave the chat deaf: the hook continues it with a one-line heartbeat prompt and listens again
# (BOARD_STOP_HEARTBEATS in a row, default 60 for orchestrators and 8 for workers, 0 = off). After the limit Codex stops.
# A chat that needs a PERSON ends its turn with a line that starts with the red stop sign (or NEEDS-HUMAN). Then this hook does not
# wait at all: the turn ends at once, so the ChatGPT app sends its turn-complete notification to the desktop and to a paired phone
# (a turn is still running while a Stop hook waits). It also beeps on this PC through tools/alert.ps1.
try { . ([IO.Path]::Combine($PSScriptRoot, 'board-hook-common.ps1')) }
catch { [Console]::Error.WriteLine('WARNING: team-board hook: board-hook-common.ps1 is missing or broken.'); exit 0 }

try {
    $ctx = Initialize-BoardHook -EventName 'stop'
    if ($null -eq $ctx) { exit 0 }
    $needsHuman = Get-HookNeedsHumanLine -Ctx $ctx
    if ($needsHuman) { Send-HookHumanAlert -Ctx $ctx -Text $needsHuman; exit 0 }
    $active = $false
    if ($null -ne $ctx.Input -and @($ctx.Input.PSObject.Properties.Name) -contains 'stop_hook_active') { $active = ($ctx.Input.stop_hook_active -eq $true) }
    if ($active -and (Get-HookSetting -Ctx $ctx -Name 'BOARD_STOP_CHAIN') -eq '0') { exit 0 }
    $frozenNow = Test-HookFrozen -Ctx $ctx

    # Orchestrator: STAGE already due -> wake at once; otherwise never wait past the due time.
    $stageSeconds = Get-HookStageSeconds -Ctx $ctx
    if ($null -ne $stageSeconds -and $stageSeconds -le 0) {
        Reset-HookHeartbeat -Ctx $ctx
        Write-HookStdout ((ConvertTo-Json -InputObject ([ordered]@{ decision = 'block'; reason = (Get-HookStageReminder -Ctx $ctx) }) -Compress) + "`n")
        exit 0
    }

    $wait = 540
    $waitSetting = Get-HookSetting -Ctx $ctx -Name 'BOARD_STOP_WAIT_SECONDS'
    if ($waitSetting -match '^\d{1,4}$') { $wait = [Math]::Min(560, [Math]::Max(1, [int]$waitSetting)) }
    if ($null -ne $stageSeconds) { $wait = [Math]::Max(1, [Math]::Min($wait, $stageSeconds + 5)) }
    $extra = @{ DurationSeconds = $wait; AsHookJson = $true }
    if ($frozenNow) { $extra['Frozen'] = $true }
    $lines = Invoke-HookBoard -Ctx $ctx -Mode 'Wait' -Extra $extra
    if ($null -eq $lines) { exit 0 }

    # The board prints at most one JSON line when woken; accept only a well-formed block decision.
    $reason = ''
    foreach ($line in $lines) {
        $candidate = ([string]$line).Trim()
        if (-not $candidate.StartsWith('{')) { continue }
        try { $parsed = ConvertFrom-Json -InputObject $candidate } catch { continue }
        if ([string]$parsed.decision -eq 'block' -and -not [string]::IsNullOrWhiteSpace([string]$parsed.reason)) { $reason = ([string]$parsed.reason).Trim() }
    }
    if (-not $reason) {
        # Nothing on the board: an orchestrator whose STAGE became due during the wait is woken now.
        if ($null -ne (Get-HookStageSeconds -Ctx $ctx) -and (Get-HookStageSeconds -Ctx $ctx) -le 0) {
            Reset-HookHeartbeat -Ctx $ctx
            Write-HookStdout ((ConvertTo-Json -InputObject ([ordered]@{ decision = 'block'; reason = (Get-HookStageReminder -Ctx $ctx) }) -Compress) + "`n")
            exit 0
        }
        # Quiet window: keep the lane listening with a heartbeat (limited) instead of letting the chat go deaf.
        $beat = Step-HookHeartbeat -Ctx $ctx -WaitSeconds $wait
        if ($beat) { Write-HookStdout ((ConvertTo-Json -InputObject ([ordered]@{ decision = 'block'; reason = $beat }) -Compress) + "`n") }
        exit 0
    }
    Reset-HookHeartbeat -Ctx $ctx

    $frozen = Save-HookFreeze -Ctx $ctx -Text $reason
    $deployFreeze = ($reason -cmatch $script:HookDeployFreezePattern)
    $reason = Limit-HookText -Ctx $ctx -Text $reason -Name 'stop'
    if ($frozen) { $reason += "`n`nLEAD: FREEZE received: do not start new features; finish only evidence, status and fixes. From now the Stop hook wakes this lane only for TASK, FIX, GATE and DEPLOY FREEZE posts (orchestrators also for their workers' reports and the STAGE reminder)." }
    if ($deployFreeze) { $reason += "`n`nDEPLOY FREEZE: do not merge or push to main from now; production deploys only what is already on main." }
    $stageAfter = Get-HookStageSeconds -Ctx $ctx
    if ($null -ne $stageAfter -and $stageAfter -le 0) { $reason += "`n`n" + (Get-HookStageReminder -Ctx $ctx) }
    Write-HookStdout ((ConvertTo-Json -InputObject ([ordered]@{ decision = 'block'; reason = $reason }) -Compress) + "`n")
}
catch { Write-HookWarning "stop hook failed; Codex stops normally. $($_.Exception.Message)" }
exit 0
