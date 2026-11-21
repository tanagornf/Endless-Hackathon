import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushOwnerConsultOutbox } from './owner-consult-outbox';

const mocks = vi.hoisted(() => ({ claim: vi.fn(), write: vi.fn(), pending: vi.fn(), notify: vi.fn(), warn: vi.fn() }));
vi.mock('../../core', () => ({ db: { maybeOne: mocks.claim, query: mocks.write }, log: { warn: mocks.warn } }));
vi.mock('./owner-consult', () => ({ isOwnerConsultActionPending: mocks.pending }));
vi.mock('../notifications/service', () => ({ notify: mocks.notify }));

const key = { businessId: randomUUID(), caseId: randomUUID(), actionStepId: 'initial' };
const notice = { ...key, language: 'th', attempts: 1 };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.claim.mockResolvedValue(null);
  mocks.pending.mockResolvedValue(true);
});

describe('owner consultation outbox', () => {
  it('keeps an ambiguous notification recoverable under the same tenant-scoped key', async () => {
    mocks.claim.mockResolvedValueOnce(notice);
    mocks.notify.mockResolvedValueOnce({ notificationIds: [], mode: 'sandbox' });
    await flushOwnerConsultOutbox();
    expect(mocks.write).not.toHaveBeenCalled();

    mocks.claim.mockResolvedValueOnce({ ...notice, attempts: 2 });
    mocks.notify.mockResolvedValueOnce({ notificationIds: [randomUUID()], mode: 'real' });
    await flushOwnerConsultOutbox();
    expect(mocks.pending).toHaveBeenCalledWith(key);
    expect(mocks.notify).toHaveBeenCalledTimes(2);
    expect(mocks.notify.mock.calls[0][0]).toEqual(mocks.notify.mock.calls[1][0]);
    expect(mocks.notify.mock.calls[0][0]).toMatchObject({
      businessId: key.businessId, to: { role: 'owners' }, type: 'system',
      dedupKey: 'ai-owner-review:' + key.businessId + ':' + key.caseId + ':initial',
      link: '/bot-settings?consult=' + key.caseId,
    });
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('AND attempts=$4'), [
      key.businessId, key.caseId, key.actionStepId, 2,
    ]);
  });

  it('skips a claimed action that was answered before dispatch', async () => {
    mocks.claim.mockResolvedValueOnce(notice);
    mocks.pending.mockResolvedValue(false);
    await flushOwnerConsultOutbox();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
