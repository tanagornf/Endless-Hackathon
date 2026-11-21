import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

test('a Thai-locale reader resumes with Gregorian UTC dates and recovers a future cursor by comment ID', () => {
  const script = [
    '. $env:ENDLESS_BOARD_SCRIPT',
    "[Threading.Thread]::CurrentThread.CurrentCulture = [Globalization.CultureInfo]::GetCultureInfo('th-TH')",
    '$timestamp = [datetime]::new(2026, 11, 21, 5, 20, 0, [DateTimeKind]::Utc)',
    'function Get-BoardUtcNow { $timestamp }',
    'function Get-BoardComments {',
    '  param($BoardRepo, $BoardIssue, $Since)',
    '  $script:sinceUsed = $Since',
    '  foreach ($id in @(100,101)) {',
    '    [pscustomobject]@{ id=$id; created_at=$timestamp; user=@{login="peer"}; body="[B1/Codex] NEED TO:C0 review"; html_url="" }',
    '  }',
    '}',
    '$ctx = @{ Repo="example/test"; Issue=1; AgentId="C0"; Login="owner"; TeamLogins=@("owner","peer") }',
    'ConvertTo-BoardIsoTime $timestamp',
    'foreach ($cursor in @("2026-11-21T05:20:00Z","2569-11-21T05:20:00Z")) {',
    '  $posts = @(Get-GitHubInboxItems -Ctx $ctx -AfterId 100 -LastCreatedAt $cursor)',
    '  "since=<$script:sinceUsed>; ids=<$($posts.Id -join \",\")>"',
    '}',
  ].join('\n');
  const output = execFileSync(process.platform === 'win32' ? 'powershell.exe' : 'pwsh', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
  ], {
    encoding: 'utf8',
    timeout: 40_000,
    env: { ...process.env, ENDLESS_BOARD_SCRIPT: resolve('tools/team-board.ps1') },
  });
  expect(output.trim().split(/\r?\n/)).toEqual([
    '2026-11-21T05:20:00Z',
    'since=<2026-11-21T05:18:00Z>; ids=<101>',
    'since=<>; ids=<101>',
  ]);
}, 45_000);
