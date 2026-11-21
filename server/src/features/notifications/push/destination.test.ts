import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ownerConsultDestination, registerOwnerConsultLookup, resolvePhoneNotice } from './destination';

const { readNotice, readTeamState } = vi.hoisted(() => ({ readNotice: vi.fn(), readTeamState: vi.fn() }));
vi.mock('../../../core', () => ({
  db: { maybeOne: readNotice },
  AppError: class extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
}));
vi.mock('../../team/service', () => ({ getConversationTeamState: readTeamState }));

const id = '6f4f637d-4909-4d33-8a25-78e5748a4e14';
const user = '99bb9603-452f-4ae9-8a9c-01a1c76dc4f5';
const businessId = 'fdd89c9a-486f-4e79-b38b-58176726595a';
const target = '5f8841f4-131c-442f-bcb4-c167c774a22b';
const step = '4e977f23-a2dc-4152-8ef3-7e4caeca90e1';
const ownerLink = '/bot-settings?consult=' + target;
const pending = vi.fn();
registerOwnerConsultLookup(pending);

const staffNotice = {
  id, businessId, userId: user, type: 'chat.handoff', language: 'th',
  role: 'staff', permissions: ['chat.read', 'chat.takeover'],
  purpose: { kind: 'staff-offer', conversationId: target, version: 12 },
};
const ownerNotice = {
  ...staffNotice, type: 'system', role: 'owner', link: ownerLink,
  purpose: { kind: 'owner-consult', caseId: target, actionStepId: step },
};

describe('authenticated phone notification destination', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    readTeamState.mockResolvedValue({ isQueued: true, version: 12 });
    pending.mockResolvedValue(true);
  });

  it('reads only the recipient’s notice and requires the same active handoff version', async () => {
    readNotice.mockResolvedValue(staffNotice);
    await expect(resolvePhoneNotice(user, id)).resolves.toEqual({ businessId, link: '/chat?c=' + target });
    expect(readNotice).toHaveBeenCalledWith(expect.stringContaining('n.user_id = $2'), [id, user, null]);
    expect(readTeamState).toHaveBeenCalledWith(target, businessId, false);
    readTeamState.mockResolvedValue({ isQueued: true, version: 13 });
    await expect(resolvePhoneNotice(user, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('avoids resolving a revoked recipient or no-longer-queued staff request', async () => {
    readNotice.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...staffNotice, permissions: ['chat.read'] }).mockResolvedValue(staffNotice);
    await expect(resolvePhoneNotice(user, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(resolvePhoneNotice(user, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(readTeamState).not.toHaveBeenCalled();
    readTeamState.mockResolvedValue({ isQueued: false, version: 12 });
    await expect(resolvePhoneNotice(user, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('opens only a live owner consult in the same business and rechecks every tap', async () => {
    readNotice.mockResolvedValue(ownerNotice);
    await expect(resolvePhoneNotice(user, id)).resolves.toEqual({ businessId, link: ownerLink });
    expect(pending).toHaveBeenCalledWith({ businessId, caseId: target, actionStepId: step });
    pending.mockResolvedValue(false);
    await expect(resolvePhoneNotice(user, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    pending.mockRejectedValue(new Error('temporary storage error'));
    await expect(resolvePhoneNotice(user, id)).rejects.toThrow('temporary storage error');
  });

  it.each([
    '//evil.example/bot-settings',
    '/\\evil.example/bot-settings',
    '/api/v1/notifications',
    '/bot-settings?consult=other',
    '/bot-settings?debug=1&consult=' + target,
    '/bot-settings?consult=' + target + '#other',
  ])('does not treat a stored external or mismatched path as an owner route', (path) => {
    expect(ownerConsultDestination(path, target)).toBeNull();
  });
});
