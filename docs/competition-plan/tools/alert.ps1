# Local human alert: make the person at THIS PC look up. Original team helper, no application code.
# Lives beside team-board.ps1 (competition repo: tools\alert.ps1). The board script calls it for every BLOCKED post and for every
# post that @mentions a person; the Stop hook calls it when a chat ends its turn asking for a person.
#
# This is the backup channel. The main channel is the ChatGPT app itself: it notifies on the desktop and on a paired phone when
# a chat finishes a turn, asks a question or needs a permission (START.md, section 3). Nothing here leaves this PC.
#
# Channels, each best effort (a failing channel never fails the caller, the exit code is always 0):
#   1. log    one line in nless.alerts.log beside the secrets file (else %TEMP%\nless.alerts.log)
#   2. toast  Windows notification that stays on screen until dismissed
#   3. sound  beeps through the sound device (no console needed)
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\alert.ps1 "B2 blocked: OpenAI key rejected (401). Need a new app-dev key."
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\alert.ps1 -MessageFile handoff\need-human.txt     (UTF-8, for Thai text)
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\alert.ps1 -Level info "SETUP READY abc1234"
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\alert.ps1 -Test                                    (check the channels)
#
# Never put a key, token, password or customer data in the message (it is written to a log file and shown on screen).
# ALERT_SOUND=0 / ALERT_TOAST=0 (environment, else ..\nless.secrets.env) switch a channel off. ASCII only (Windows PowerShell 5.1).
[CmdletBinding()]
param(
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)][string[]]$Message = @(),
    [string]$MessageFile = '',
    [ValidateSet('blocked', 'info', 'done')][string]$Level = 'blocked',
    [string]$Lane = '',
    [string]$SecretsFile = '',
    [switch]$NoSound,
    [switch]$NoToast,
    [switch]$Test
)

$script:AlertRoot = $PSScriptRoot

function Get-AlertSecretsPath {
    param([string]$Explicit)
    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($Explicit)) { $candidates += $Explicit }
    $here = (Get-Location -PSProvider FileSystem).ProviderPath
    $candidates += (Join-Path $here '..\nless.secrets.env')
    if (-not [string]::IsNullOrWhiteSpace($script:AlertRoot)) {
        # competition repo: <worktree>\tools -> beside the worktree; planning repo: <repo>\docs\competition-plan\tools -> beside the repo
        $candidates += (Join-Path $script:AlertRoot '..\..\nless.secrets.env')
        $candidates += (Join-Path $script:AlertRoot '..\..\..\..\nless.secrets.env')
    }
    foreach ($candidate in $candidates) {
        try { $full = [IO.Path]::GetFullPath($candidate); if ([IO.File]::Exists($full)) { return $full } } catch { }
    }
    return ''
}

function Get-AlertSetting {
    # The environment wins; in the file the last non-empty value of a name wins (same rule as the board script).
    param([string]$Name, [string]$SecretsPath)
    $value = [Environment]::GetEnvironmentVariable($Name)
    if (-not [string]::IsNullOrWhiteSpace($value)) { return ([string]$value).Trim() }
    if ([string]::IsNullOrWhiteSpace($SecretsPath)) { return '' }
    $last = ''
    try {
        foreach ($line in [IO.File]::ReadAllLines($SecretsPath, [Text.Encoding]::UTF8)) {
            $entry = $line.Trim()
            if ($entry.Length -eq 0 -or $entry.StartsWith('#')) { continue }
            if ($entry.StartsWith('export ')) { $entry = $entry.Substring(7).TrimStart() }
            $eq = $entry.IndexOf('=')
            if ($eq -lt 1) { continue }
            if ($entry.Substring(0, $eq).Trim() -ne $Name) { continue }
            $found = $entry.Substring($eq + 1).Trim()
            if ($found.Length -ge 2 -and (($found.StartsWith('"') -and $found.EndsWith('"')) -or ($found.StartsWith("'") -and $found.EndsWith("'")))) { $found = $found.Substring(1, $found.Length - 2) }
            if ($found.Length -gt 0) { $last = $found }
        }
    }
    catch { }
    return $last
}

function Hide-AlertSecret {
    # Belt and braces: the rule is "no secrets in alerts", this catches the obvious shapes anyway.
    param([string]$Value)
    $result = [regex]::Replace([string]$Value, '(?i)\b(sk|rk|pk)-[A-Za-z0-9_\-]{12,}', '[REDACTED]')
    $result = [regex]::Replace($result, '(?i)(bearer\s+)[^\s"'',;]+', '${1}[REDACTED]')
    $result = [regex]::Replace($result, '(?i)\b(postgres(?:ql)?://[^:\s/]+:)[^@\s]+@', '${1}[REDACTED]@')
    $result = [regex]::Replace($result, '\b[A-Fa-f0-9]{40,}\b', '[REDACTED]')
    return $result
}

function Invoke-AlertSound {
    param([string]$Level)
    $rounds = 1
    if ($Level -eq 'blocked') { $rounds = 3 }
    try {
        for ($i = 0; $i -lt $rounds; $i++) { [Console]::Beep(1175, 180); [Console]::Beep(880, 180) }
        return 'sound ok'
    }
    catch {
        try { [System.Media.SystemSounds]::Exclamation.Play(); Start-Sleep -Milliseconds 500; return 'sound ok (system sound)' }
        catch { return 'sound FAILED' }
    }
}

function Invoke-AlertToast {
    param([string]$Title, [string]$Body, [string]$Level)
    try {
        [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
        [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
        $safeTitle = [Security.SecurityElement]::Escape($Title)
        $safeBody = [Security.SecurityElement]::Escape($Body)
        $scenario = 'default'
        $actions = ''
        if ($Level -eq 'blocked') {
            # "reminder" keeps the toast on screen until the person dismisses it.
            $scenario = 'reminder'
            $actions = '<actions><action activationType="system" arguments="dismiss" content="OK"/></actions>'
        }
        $xmlText = "<toast scenario=`"$scenario`"><visual><binding template=`"ToastGeneric`"><text>$safeTitle</text><text>$safeBody</text></binding></visual>$actions</toast>"
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($xmlText)
        $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
        $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
        return 'toast ok'
    }
    catch { return 'toast FAILED' }
}

function Invoke-Alert {
    param([string]$Text, [string]$Level, [string]$Lane, [string]$SecretsFile, [bool]$Sound, [bool]$Toast)
    $secretsPath = Get-AlertSecretsPath -Explicit $SecretsFile
    if ([string]::IsNullOrWhiteSpace($Lane)) {
        try { $laneFile = Join-Path (Get-Location -PSProvider FileSystem).ProviderPath '.lane'; if ([IO.File]::Exists($laneFile)) { $Lane = ([IO.File]::ReadAllText($laneFile)).Trim().ToUpperInvariant() } } catch { }
    }
    if ($Lane -notmatch '^[A-Za-z0-9_-]{1,40}$') { $Lane = '' }
    $clean = Hide-AlertSecret (([string]$Text) -replace '\s+', ' ').Trim()
    if ($clean.Length -eq 0) { $clean = 'A Codex session needs a person (no message was given).' }
    if ($clean.Length -gt 600) { $clean = $clean.Substring(0, 597) + '...' }
    $label = 'NEEDS A HUMAN'
    if ($Level -eq 'info') { $label = 'INFO' } elseif ($Level -eq 'done') { $label = 'DONE' }
    $title = "Endless $label"
    if ($Lane) { $title = "Endless $label [$Lane]" }

    # 1. log (always)
    $logNote = 'log FAILED'
    $logDirectory = [IO.Path]::GetTempPath()
    if ($secretsPath) { $logDirectory = [IO.Path]::GetDirectoryName($secretsPath) }
    $logPath = Join-Path $logDirectory 'nless.alerts.log'
    $stamp = [DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss')
    try { [IO.File]::AppendAllText($logPath, "$stamp [$Level] [$Lane] $clean`r`n", [Text.UTF8Encoding]::new($false)); $logNote = "log $logPath" }
    catch {
        try { $logPath = Join-Path ([IO.Path]::GetTempPath()) 'nless.alerts.log'; [IO.File]::AppendAllText($logPath, "$stamp [$Level] [$Lane] $clean`r`n", [Text.UTF8Encoding]::new($false)); $logNote = "log $logPath" } catch { }
    }

    # Throttle the noisy channels: the same text within 60 s, or more than one alert within 5 s, only logs.
    $quiet = $false
    try {
        $sha = [Security.Cryptography.SHA256]::Create()
        $hash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes("$Level|$clean")))).Replace('-', '').Substring(0, 16)
        $sha.Dispose()
        $statePath = Join-Path ([IO.Path]::GetTempPath()) 'nless-alert-last.txt'
        if ([IO.File]::Exists($statePath)) {
            $parts = ([IO.File]::ReadAllText($statePath)).Trim().Split('|')
            if ($parts.Count -eq 2) {
                $age = ([DateTime]::UtcNow - [DateTime]::Parse($parts[1], [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)).TotalSeconds
                if (($parts[0] -eq $hash -and $age -lt 60) -or ($age -ge 0 -and $age -lt 5)) { $quiet = $true }
            }
        }
        if (-not $quiet) { [IO.File]::WriteAllText($statePath, "$hash|" + [DateTime]::UtcNow.ToString('o')) }
    }
    catch { }
    if ($quiet) { Write-Output "Alert: repeated within the throttle window, logged only ($logNote)."; return }

    $notes = @($logNote)
    if ($Toast -and (Get-AlertSetting -Name 'ALERT_TOAST' -SecretsPath $secretsPath) -ne '0') { $notes += (Invoke-AlertToast -Title $title -Body $clean -Level $Level) }
    if ($Sound -and (Get-AlertSetting -Name 'ALERT_SOUND' -SecretsPath $secretsPath) -ne '0') { $notes += (Invoke-AlertSound -Level $Level) }
    Write-Output ("Alert sent to the person at this PC: " + ($notes -join ' | '))
}

if ($MyInvocation.InvocationName -ne '.') {
    $text = ''
    if (-not [string]::IsNullOrWhiteSpace($MessageFile)) {
        try { $text = [IO.File]::ReadAllText([IO.Path]::GetFullPath((Join-Path (Get-Location -PSProvider FileSystem).ProviderPath $MessageFile)), [Text.Encoding]::UTF8) }
        catch { $text = "Alert message file could not be read: $MessageFile" }
    }
    elseif ($Message.Count -gt 0) { $text = ($Message -join ' ') }
    if ($Test) { $text = 'Test alert. If you can hear this and see a Windows notification, the local alert works.'; $Level = 'blocked' }
    try { Invoke-Alert -Text $text -Level $Level -Lane $Lane -SecretsFile $SecretsFile -Sound (-not $NoSound) -Toast (-not $NoToast) }
    catch { Write-Output "Alert failed: $($_.Exception.Message)" }
}
