import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, db } from '../../core';
import type { DbExecutor } from '../../core';
import { createSignupAccount } from './signup';
import { verifyPassword } from './password';

vi.mock('../../core', async (original) => {
  const core = await original<typeof import('../../core')>();
  return { ...core, db: { tx: vi.fn() } };
});

const input = {
  email: 'new-owner@example.test', password: 'correct-horse-battery', displayName: 'New Owner',
  businessName: 'New Shop', locale: 'en' as const,
};

describe('signup transaction', () => {
  const query = vi.fn();
  const maybeOne = vi.fn();
  const one = vi.fn();
  const tx = { query, maybeOne, one } as DbExecutor;
  const tenancy = {
    provisionAccountForUser: vi.fn(),
    acceptInvitation: vi.fn(),
    completeInvitationAcceptance: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.tx).mockImplementation((run) => run(tx));
    maybeOne.mockResolvedValue(null);
    one.mockResolvedValue({ id: 'new-user' });
    tenancy.provisionAccountForUser.mockResolvedValue({ accountId: 'shop-account', businessId: 'new-business', created: true });
    tenancy.acceptInvitation.mockResolvedValue({ businessId: 'existing-business' });
  });

  it('normalizes the email and provisions using the same transaction as the user insert', async () => {
    const result = await createSignupAccount({ ...input, email: ' NEW-OWNER@EXAMPLE.TEST ' }, tenancy);
    expect(result).toEqual({ userId: 'new-user', businessId: 'new-business', emailVerified: false });
    expect(query.mock.calls[0][1]).toEqual(['auth-email:new-owner@example.test']);
    const [, params] = one.mock.calls[0];
    expect(params.slice(0, 3)).toEqual(['new-owner@example.test', 'New Owner', 'en']);
    expect(await verifyPassword(input.password, params[3])).toBe(true);
    expect(params[4]).toBe(false);
    expect(tenancy.provisionAccountForUser).toHaveBeenCalledWith('new-user', { businessName: 'New Shop', language: 'en' }, tx);
    expect(tenancy.acceptInvitation).not.toHaveBeenCalled();
  });

  it('uses only the invitation contract for invited accounts', async () => {
    const inviteToken = 'x'.repeat(43);
    const result = await createSignupAccount({ ...input, businessName: undefined, inviteToken }, tenancy);
    expect(result).toEqual({ userId: 'new-user', businessId: 'existing-business', emailVerified: true, inviteToken });
    expect(one.mock.calls[0][1][4]).toBe(true);
    expect(tenancy.acceptInvitation).toHaveBeenCalledWith('new-user', inviteToken, tx);
    expect(tenancy.provisionAccountForUser).not.toHaveBeenCalled();
    expect(tenancy.completeInvitationAcceptance).not.toHaveBeenCalled();
  });

  it('returns the duplicate error before inserting another user', async () => {
    maybeOne.mockResolvedValue({ id: 'existing-user' });
    await expect(createSignupAccount(input, tenancy)).rejects.toMatchObject({
      code: 'POLICY_BLOCKED', details: { reason: 'email_taken' },
    });
    expect(one).not.toHaveBeenCalled();
    expect(tenancy.provisionAccountForUser).not.toHaveBeenCalled();
  });

  it('lets provisioning or invitation failures escape the transaction', async () => {
    const failure = new AppError('PERMISSION_DENIED', 'Invitation email does not match', { details: { reason: 'email_mismatch' } });
    tenancy.acceptInvitation.mockRejectedValue(failure);
    await expect(createSignupAccount({ ...input, inviteToken: 'x'.repeat(43) }, tenancy)).rejects.toBe(failure);
    tenancy.provisionAccountForUser.mockRejectedValue(new Error('Provisioning failed'));
    await expect(createSignupAccount(input, tenancy)).rejects.toThrow('Provisioning failed');
  });

  it('rejects missing shop names and weak passwords before database writes', async () => {
    await expect(createSignupAccount({ ...input, businessName: undefined }, tenancy)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(createSignupAccount({ ...input, password: 'password123' }, tenancy)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR', details: { issues: [{ path: 'password', code: 'common' }] },
    });
    expect(db.tx).not.toHaveBeenCalled();
  });
});
