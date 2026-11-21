import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintLineAction } from './actionTokens';

const fixtures = vi.hoisted(() => ({ insert: vi.fn(), encrypt: vi.fn() }));
vi.mock('../../core', async () => ({
  AppError: (await import('../../core/errors')).AppError,
  config: { SESSION_SECRET: 'synthetic-action-signing-secret' },
  db: { maybeOne: fixtures.insert },
  encryptSecret: fixtures.encrypt,
  decryptSecret: (encrypted: string) => encrypted,
}));

const delivery = { businessId: 'shop', messageId: 'message', conversationId: 'conversation' };
const action = { kind: 'order' as const, proposalId: 'proposal', version: 2, decision: 'confirm' as const,
  reviewToken: 'synthetic-review-token', expiresAt: new Date(Date.now() + 60_000).toISOString() };

describe('LINE confirmation action IDs', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fixtures.encrypt.mockImplementation((secret: string) => 'encrypted:' + secret.split('-').at(0));
    fixtures.insert.mockImplementation(async (_sql: string, params: string[]) => ({ id: params[0], review_token_enc: params[8] }));
  });

  it('persists a tenant-scoped encrypted action and only returns a stable short ID', async () => {
    const first = await mintLineAction(delivery, action);
    expect(first).toMatch(/^nl:a:[a-z0-9]{12}$/);
    expect(first).not.toContain(action.reviewToken);
    expect(await mintLineAction(delivery, action)).toBe(first);
    expect(fixtures.encrypt).toHaveBeenCalledWith(action.reviewToken);
    expect(fixtures.insert).toHaveBeenCalledWith(expect.stringContaining('m.business_id = c.business_id'), [
      first.slice(5), delivery.businessId, delivery.conversationId, delivery.messageId, action.kind, action.proposalId,
      action.version, action.decision, 'encrypted:synthetic', new Date(action.expiresAt),
    ]);
  });

  it('uses different action IDs for decisions and tenants', async () => {
    const confirm = await mintLineAction(delivery, action);
    expect(await mintLineAction(delivery, { ...action, decision: 'cancel' })).not.toBe(confirm);
    expect(await mintLineAction({ ...delivery, businessId: 'other-shop' }, action)).not.toBe(confirm);
  });

  it('does not sign an invalid lifetime or a conversation outside the message scope', async () => {
    await expect(mintLineAction(delivery, { ...action, expiresAt: 'invalid' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fixtures.insert).not.toHaveBeenCalled();
    fixtures.insert.mockResolvedValueOnce(null);
    await expect(mintLineAction(delivery, action)).rejects.toMatchObject({ code: 'POLICY_BLOCKED' });
  });
});
