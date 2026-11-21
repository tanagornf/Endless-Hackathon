import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushOwnerConsultAnswerOutbox, registerOwnerConsultAnswerConsumer } from './owner-consult-answer-outbox';

const mocks = vi.hoisted(() => ({ claim: vi.fn(), settle: vi.fn(), enqueue: vi.fn(), warn: vi.fn() }));
vi.mock('../../core', () => ({
  db: { maybeOne: mocks.claim, query: mocks.settle },
  jobs: { enqueue: mocks.enqueue },
  log: { warn: mocks.warn },
}));

const job = { businessId: randomUUID(), caseId: randomUUID(), actionStepId: 'initial', answerReceiptId: randomUUID() };
const conversationId = randomUUID();

beforeEach(() => {
  vi.resetAllMocks();
  mocks.claim.mockResolvedValue(null);
});

describe('owner answer queue', () => {
  it('keeps committed work available while the F10 consumer is unregistered', async () => {
    await flushOwnerConsultAnswerOutbox();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('reuses one tenant-owned F10 job after an ambiguous enqueue', async () => {
    registerOwnerConsultAnswerConsumer();
    mocks.claim.mockResolvedValueOnce({ ...job, conversationId, attempts: 1 });
    mocks.enqueue.mockRejectedValueOnce(new Error('acknowledgement lost'));
    await flushOwnerConsultAnswerOutbox();
    expect(mocks.settle).not.toHaveBeenCalled();

    mocks.claim.mockResolvedValueOnce({ ...job, conversationId, attempts: 2 });
    mocks.enqueue.mockResolvedValueOnce({ jobId: randomUUID(), deduped: true });
    await flushOwnerConsultAnswerOutbox();
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
    expect(mocks.enqueue.mock.calls[0]).toEqual(mocks.enqueue.mock.calls[1]);
    expect(mocks.enqueue).toHaveBeenLastCalledWith('ai.owner_consult.resume', job, {
      businessId: job.businessId,
      dedupKey: 'ai-owner-answer:' + job.businessId + ':' + job.answerReceiptId,
      lockKey: 'conversation:' + conversationId,
    });
    expect(mocks.settle).toHaveBeenCalledOnce();
  });
});
