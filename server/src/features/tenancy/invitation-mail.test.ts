import type { InvitationRow } from '@nless/shared/features/tenancy/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deliverInvitation } from './invitation-mail';
import { hashInvitationToken } from './tokens';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), queue: vi.fn(), warn: vi.fn() }));
vi.mock('../../core', () => ({
  config: { APP_BASE_URL: 'https://endless.example.test' },
  db: { maybeOne: mocks.lookup },
  log: { warn: mocks.warn },
}));
vi.mock('../auth/service', () => ({ queueEmail: mocks.queue }));

const token = 'a'.repeat(43);
const link = 'https://endless.example.test/invitations/accept?token=' + token;
const invitation: InvitationRow = {
  id: '00000000-0000-4000-8000-000000000123', email: 'recipient@example.test',
  status: 'pending', permissions: [], invitedByName: 'Shop owner', acceptedAt: null,
  createdAt: '2026-11-21T00:00:00.000Z', expiresAt: '2026-11-24T00:00:00.000Z',
};
const scoped = {
  businessId: '00000000-0000-4000-8000-000000000456', email: invitation.email,
  businessName: 'Demo shop', inviterName: 'Shop owner', expiresAt: new Date(invitation.expiresAt),
  language: 'en', timezone: 'Asia/Bangkok',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lookup.mockResolvedValue(scoped);
  mocks.queue.mockResolvedValue({ outboxId: 'sandbox-mail-1', delivery: 'email_sandbox' });
});

describe('sandbox invitation mail', () => {
  it('uses the committed recipient and reports a confirmed F02 sandbox row', async () => {
        const altered = { ...invitation, email: 'other-recipient@example.test', invitedByName: 'Other owner' };
    expect(await deliverInvitation(altered, link)).toBe('email_sandbox'); expect(mocks.lookup).toHaveBeenCalledWith(expect.stringContaining('i.token_hash=$2'), [
      invitation.id, hashInvitationToken(token),
    ]);
    expect(mocks.queue).toHaveBeenCalledExactlyOnceWith({
      to: scoped.email, template: 'invitation', locale: 'en', actionUrl: link,
      vars: { business: scoped.businessName, inviter: scoped.inviterName, when: expect.stringContaining('07:00') },
    });
  });

  it('uses the shop language and localized inviter fallback', async () => {
    mocks.lookup.mockResolvedValue({ ...scoped, language: 'th', inviterName: null });
    expect(await deliverInvitation(invitation, link)).toBe('email_sandbox');
    expect(mocks.queue).toHaveBeenCalledWith(expect.objectContaining({
      locale: 'th', vars: expect.objectContaining({ business: scoped.businessName, inviter: 'ทีมงานร้าน' }),
    }));
  });

  it('does not queue a superseded, revoked, or foreign link', async () => {
    mocks.lookup.mockResolvedValue(null);
    expect(await deliverInvitation(invitation, link)).toBe('link_only');
    expect(mocks.queue).not.toHaveBeenCalled();
    await deliverInvitation(invitation, link.replace('endless.example.test', 'other.example.test'));
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it('keeps the manual link on outbox failure and does not repeat an ambiguous write', async () => {
    mocks.queue.mockRejectedValue(new Error('outbox failure: ' + link + ' ' + scoped.email));
    expect(await deliverInvitation(invitation, link)).toBe('link_only');
    expect(mocks.queue).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalledWith({ invitationId: invitation.id }, 'Invitation sandbox mail was not confirmed');
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(token);
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(scoped.email);
  });

  it('uses manual delivery when the port has no persisted receipt', async () => {
    mocks.queue.mockResolvedValue({ outboxId: '', delivery: 'email_sandbox' });
    expect(await deliverInvitation(invitation, link)).toBe('link_only');
  });
});
