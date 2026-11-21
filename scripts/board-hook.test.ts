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
