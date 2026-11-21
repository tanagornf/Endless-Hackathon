import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../core';
import type { DbExecutor } from '../../core';
import { forgotPassword, resetPassword } from './password-recovery';

vi.mock('../../core', async (original) => {
  const core = await original<typeof import('../../core')>();
  return { ...core, audit: vi.fn(), db: { tx: vi.fn() }, revokeUserSessions: vi.fn() };
});

const ports = { issueToken: vi.fn(), consumeToken: vi.fn(), insertSandboxMail: vi.fn() };
const tx = { one: vi.fn(), maybeOne: vi.fn(), query: vi.fn() } as DbExecutor;
const req = { ip: '192.0.2.3', get: (key: string) => key === 'x-requested-with' ? 'nless' : undefined } as Request;

describe('password recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.tx).mockImplementation((run) => run(tx));
  });

  it('returns the generic forgot response when the account lookup has no eligible user', async () => {
    vi.mocked(tx.maybeOne).mockResolvedValue(null);
    await expect(forgotPassword(req, { email: 'unknown@example.test' }, ports)).resolves.toEqual({ ok: true });
    expect(ports.issueToken).not.toHaveBeenCalled();
    expect(ports.insertSandboxMail).not.toHaveBeenCalled();
  });

  it('uses the same response when the reset outbox is temporarily unavailable', async () => {
    vi.mocked(db.tx).mockRejectedValue(new Error('Unavailable'));
    await expect(forgotPassword(req, { email: 'another@example.test' }, ports)).resolves.toEqual({ ok: true });
  });

  it('rejects a weak replacement within the same transaction before changing credentials', async () => {
    ports.consumeToken.mockResolvedValue('example-user-id');
    vi.mocked(tx.one).mockResolvedValue({ email: 'known@example.test', display_name: 'Test User', status: 'active' });
    await expect(resetPassword(req, { token: 'x'.repeat(43), newPassword: 'password123' }, ports))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', details: { issues: [{ path: 'newPassword', code: 'common' }] } });
    expect(ports.consumeToken).toHaveBeenCalledWith('x'.repeat(43), 'reset_password', tx);
    expect(tx.query).not.toHaveBeenCalled();
  });
});
