import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readOwnerConsultAnswer, withOwnerConsultDraftConsent } from './owner-consult-answer';

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../core', () => ({ db: { maybeOne: mocks.read } }));

const key = { businessId: randomUUID(), caseId: randomUUID(), actionStepId: 'initial', answerReceiptId: randomUUID() };
const receipt = {
  ...key, conversationId: randomUUID(), triggerMessageId: randomUUID(), language: 'en',
  answer: 'For this customer alone, replace the missing part.', reuse: 'case_only', version: 2,
};

beforeEach(() => mocks.read.mockReset());

describe('owner consult draft consent', () => {
  it('preserves case-only continuation and blocks learning even after a replayed knowledge_add proposal', async () => {
    mocks.read.mockResolvedValue(receipt);
    expect(await readOwnerConsultAnswer(key)).toEqual(receipt);

    const queueAnalysis = vi.fn();
    const retryAnalysis = vi.fn().mockResolvedValue({ action: 'knowledge_add' });
    const staleProposal = { action: 'knowledge_add' };
    const createDraft = vi.fn().mockResolvedValue(staleProposal);
    const publish = vi.fn();
    for (const action of [queueAnalysis, retryAnalysis, createDraft, publish]) {
      expect(await withOwnerConsultDraftConsent(key, action)).toBeNull();
      expect(action).not.toHaveBeenCalled();
    }
    expect(mocks.read).toHaveBeenCalledTimes(5);
    expect(mocks.read).toHaveBeenLastCalledWith(expect.stringContaining('s.answer_receipt_id=$4'), [
      key.businessId, key.caseId, key.actionStepId, key.answerReceiptId,
    ]);
  });

  it('runs draft work only for persisted explicit permission and a matching receipt', async () => {
    mocks.read.mockResolvedValueOnce({ ...receipt, reuse: 'propose_draft' }).mockResolvedValueOnce(null);
    const createDraft = vi.fn().mockResolvedValue('draft-id');
    await expect(withOwnerConsultDraftConsent(key, createDraft)).resolves.toBe('draft-id');
    expect(createDraft).toHaveBeenCalledExactlyOnceWith({ ...receipt, reuse: 'propose_draft' });
    await expect(withOwnerConsultDraftConsent({ ...key, answerReceiptId: randomUUID() }, createDraft)).resolves.toBeNull();
    expect(createDraft).toHaveBeenCalledTimes(1);
  });
});
