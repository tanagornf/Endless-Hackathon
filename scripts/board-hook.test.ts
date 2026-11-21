import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';

test('a board hook can find the installed Windows GitHub CLI with a stale PATH', () => {
  const root = mkdtempSync(join(tmpdir(), 'endless-hook-'));
  try {
    const installation = join(root, 'Program Files', 'GitHub CLI');
    mkdirSync(installation, { recursive: true });
    const executable = join(installation, 'gh.exe');
    writeFileSync(executable, '');
    chmodSync(executable, 0o755);
    writeFileSync(join(root, 'probe.ps1'), [
      'param($Mode, $AgentId)',
      '(Get-Command gh.exe -CommandType Application -ErrorAction SilentlyContinue).Source',
    ].join('\n'));

    const result = execFileSync(process.platform === 'win32' ? 'powershell.exe' : 'pwsh', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', [
        '. $env:ENDLESS_HOOK_COMMON',
        '$env:ProgramFiles = Join-Path $env:ENDLESS_HOOK_TEST_ROOT "Program Files"',
        '$env:PATH = $env:ENDLESS_HOOK_TEST_ROOT',
        '$ctx = @{ Root=$env:ENDLESS_HOOK_TEST_ROOT; Lane="C0"; Board=(Join-Path $env:ENDLESS_HOOK_TEST_ROOT "probe.ps1") }',
        'Invoke-HookBoard -Ctx $ctx -Mode Read',
        'Write-Output $env:PATH',
      ].join('\n'),
    ], {
      encoding: 'utf8',
      timeout: 40_000,
      env: { ...process.env, ENDLESS_HOOK_TEST_ROOT: root, ENDLESS_HOOK_COMMON: resolve('.codex/hooks/board-hook-common.ps1') },
    });
    expect(result.trim().split(/\r?\n/)).toEqual([executable, root]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 45_000);

test('a bound worktree only supplies a hook context to its owner chat', () => {
  const root = mkdtempSync(join(tmpdir(), 'endless-hook-session-'));
  try {
    mkdirSync(join(root, '.team-board'));
    mkdirSync(join(root, 'tools'));
    writeFileSync(join(root, '.lane'), 'C0');
    writeFileSync(join(root, 'tools', 'team-board.ps1'), '');
    const result = execFileSync(process.platform === 'win32' ? 'powershell.exe' : 'pwsh', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', [
        '. $env:ENDLESS_HOOK_COMMON',
        '$root = $env:ENDLESS_HOOK_TEST_ROOT',
        '$binding = Join-Path (Join-Path $root ".team-board") "hook-session.txt"',
        '$payload = [pscustomobject]@{ cwd=$root; session_id="other"; agent_id=$null }',
        'function Read-HookInput { $payload }',
        'function Admitted { $null -ne (Initialize-BoardHook -EventName "stop") }',
        'Admitted',
        '[IO.File]::WriteAllText($binding, "owner")',
        'Admitted',
        '$payload.session_id=$null; Admitted',
        '$payload.session_id="owner"; Admitted',
        '$payload.agent_id="worker"; Admitted',
        '[IO.File]::WriteAllText($binding, ""); $payload.agent_id=$null; $payload.session_id=$null; Admitted',
      ].join('\n'),
    ], {
      encoding: 'utf8',
      timeout: 40_000,
      env: { ...process.env, ENDLESS_HOOK_TEST_ROOT: root, ENDLESS_HOOK_COMMON: resolve('.codex/hooks/board-hook-common.ps1') },
    });
    expect(result.trim().split(/\r?\n/)).toEqual(['True', 'False', 'False', 'True', 'False', 'False']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 45_000);
