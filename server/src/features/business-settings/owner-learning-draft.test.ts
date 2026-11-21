import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { prepareOwnerLearningDraft } from './owner-learning-draft';
import type { OwnerLearningDraftInput, OwnerLearningDraftReceipt } from './owner-learning-draft';
import type { KnowledgeDraftInput } from '@nless/shared/features/knowledge/types';
import { db } from '../../core';

const key: OwnerLearningDraftInput = {
  businessId: '11111111-1111-4111-8111-111111111111',
  caseId: '22222222-2222-4222-8222-222222222222',
  actionStepId: 'step-1',
  answerReceiptId: '33333333-3333-4333-8333-333333333333',
  expectedVersion: 2,
};
const ownerId = '44444444-4444-4444-8444-444444444444';
const anotherShop = '55555555-5555-4555-8555-555555555555';
const canonical = 'ai-owner-review:' + key.businessId + ':' + key.caseId + ':' + key.actionStepId;
const receipt: OwnerLearningDraftReceipt = {
  businessId: key.businessId,
  caseId: key.caseId,
  actionStepId: key.actionStepId,
  answerReceiptId: key.answerReceiptId,
  version: key.expectedVersion,
  state: 'answered',
  reuse: 'propose_draft',
  actorUserId: ownerId,
  language: 'th',
  question: 'รับของได้เมื่อไหร่ ติดต่อ buyer@example.test',
  answer: 'รับได้วันศุกร์ โทร 081-234-5678 https://example.test/private-help',
};
const valid = {
  action: 'draft',
  caseId: key.caseId,
  targetId: canonical,
  expectedVersion: key.expectedVersion,
  textTh: 'รับสินค้าได้วันศุกร์',
  textEn: 'Pickup is available on Friday.',
  reason: 'The owner confirmed the pickup day.',
};

function ports() {
  return {
    analyze: vi.fn().mockResolvedValue(valid),
    readReceipt: vi.fn().mockResolvedValue(receipt),
    createDraft: vi.fn().mockResolvedValue({ itemId: 'draft-1', revision: 1, created: true, warnings: [] }),
    readDraftRevision: vi.fn(),
  };
}

describe('owner-reviewed learning draft', () => {
  it('uses authoritative provenance, redacts analysis input, and writes one bilingual draft', async () => {
    const deps = ports();
    const original = { ...receipt };
    const signal = new AbortController().signal;
    const result = await prepareOwnerLearningDraft(key, { ...deps, signal });
    expect(result).toMatchObject({
      kind: 'draft', itemId: 'draft-1', created: true, revision: 1,
    });

    expect(deps.readReceipt).toHaveBeenCalledTimes(2);
    expect(deps.readReceipt).toHaveBeenCalledWith(key);
    expect(deps.analyze).toHaveBeenCalledTimes(1);
    const request = deps.analyze.mock.calls[0][0];
    expect(request.signal).toBe(signal);
    expect(request.usage).toMatchObject({ featureId: 'F04', businessId: key.businessId, purpose: 'learning.owner-correction' });
    expect(request.responseFormat).toMatchObject({ strict: true, schema: { type: 'object', additionalProperties: false } });
    expect(JSON.parse(request.redactedInput)).toMatchObject({ caseId: key.caseId, targetId: canonical, expectedVersion: 2 });
    for (const value of ['buyer@example.test', '081-234-5678', 'private-help', ownerId]) {
      expect(request.redactedInput.includes(value)).toBe(false);
    }
    expect(receipt).toEqual(original);

    expect(deps.createDraft).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      businessId: key.businessId, kind: 'faq', actorUserId: ownerId,
      sourceRef: canonical + ':receipt:' + key.answerReceiptId,
      clientRequestId: canonical,
      body: expect.stringContaining(valid.textTh),
    }));
    const write: KnowledgeDraftInput = deps.createDraft.mock.calls[0][0];
    expect(write.body).toContain(valid.textEn);
    expect(write.title).not.toContain('buyer@example.test');
    const digest = createHash('sha256').update(JSON.stringify({ title: write.title, body: write.body })).digest('hex');
    expect(result).toMatchObject({ candidateDigest: digest });
  });

  it.each([
    [null, 'receipt_unavailable'],
    [{ ...receipt, businessId: anotherShop }, 'receipt_unavailable'],
    [{ ...receipt, answerReceiptId: anotherShop }, 'receipt_unavailable'],
    [{ ...receipt, reuse: 'case_only' }, 'case_only'],
    [{ ...receipt, reuse: 'case_only', language: 'en' }, 'case_only'],
    [{ ...receipt, version: 3 }, 'stale_version'],
  ])('skips analysis and writes for unavailable, case-only, or stale receipts', async (value, reason) => {
    const deps = ports();
    deps.readReceipt.mockResolvedValue(value);
    await expect(prepareOwnerLearningDraft(key, deps)).resolves.toEqual({ kind: 'skipped', reason });
    expect(deps.analyze).not.toHaveBeenCalled();
    expect(deps.createDraft).not.toHaveBeenCalled();
  });

  it('loads the committed receipt through the default tenant-scoped database reader', async () => {
    const deps = ports();
    const read = vi.spyOn(db, 'maybeOne').mockResolvedValue(receipt);
    try {
      await expect(prepareOwnerLearningDraft(key, { analyze: deps.analyze, createDraft: deps.createDraft }))
        .resolves.toMatchObject({ kind: 'draft' });
      expect(read).toHaveBeenCalledTimes(2);
      for (const [sql, params] of read.mock.calls) {
        expect(sql).toContain("m.role = 'owner'");
        expect(sql).toContain('s.answer_receipt_id = $4');
        expect(sql).toContain('NOT EXISTS');
        expect(params).toEqual([key.businessId, key.caseId, key.actionStepId, key.answerReceiptId]);
      }
    } finally {
      read.mockRestore();
    }
  });

  it.each([
    [{ ...receipt, answer: 'วันเสาร์' }, 'stale_version'],
    [{ ...receipt, reuse: 'case_only' }, 'case_only'],
    [{ ...receipt, businessId: anotherShop }, 'receipt_unavailable'],
  ])('rechecks the receipt after analysis and refuses revoked consent or a changed answer', async (current, reason) => {
    const deps = ports();
    deps.readReceipt.mockResolvedValueOnce(receipt).mockResolvedValueOnce(current);
    await expect(prepareOwnerLearningDraft(key, deps)).resolves.toEqual({ kind: 'skipped', reason });
    expect(deps.analyze).toHaveBeenCalledOnce();
    expect(deps.createDraft).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...valid, action: 'no_change', textTh: null, textEn: null }, 'no_change'],
    [{ ...valid, action: 'no_change' }, 'invalid_candidate'],
    [{ ...valid, activate: true }, 'invalid_candidate'],
    [{ ...valid, targetId: key.answerReceiptId }, 'invalid_candidate'],
    [{ ...valid, expectedVersion: 1 }, 'invalid_candidate'],
    [{ ...valid, textTh: null }, 'invalid_candidate'],
    [{ ...valid, textEn: 'Contact buyer@example.test on Friday.' }, 'invalid_candidate'],
  ])('stores nothing for a no-change or invalid model candidate', async (candidate, reason) => {
    const deps = ports();
    deps.analyze.mockResolvedValue(candidate);
    await expect(prepareOwnerLearningDraft(key, deps)).resolves.toEqual({ kind: 'skipped', reason });
    expect(deps.createDraft).not.toHaveBeenCalled();
  });

  it('reuses the same F05 idempotency key on a replay', async () => {
    const deps = ports();
    const items = new Map<string, { id: string; title: string; body: string }>();
    deps.createDraft.mockImplementation(async (input: KnowledgeDraftInput) => {
      const existing = items.get(input.clientRequestId);
      const row = existing ?? { id: 'draft-' + (items.size + 1), title: input.title, body: input.body };
      items.set(input.clientRequestId, row);
      return { itemId: row.id, created: !existing, revision: 1, warnings: [] };
    });
    deps.readDraftRevision.mockImplementation(async () => items.get(canonical) ?? null);
    const created = await prepareOwnerLearningDraft(key, deps);
    expect(created).toMatchObject({ itemId: 'draft-1', created: true });
    if (created.kind !== 'draft') throw new Error('Expected a draft');
    deps.analyze.mockResolvedValueOnce({ ...valid, textEn: 'The shop will hold orders for Friday pickup.' });
    await expect(prepareOwnerLearningDraft(key, deps)).resolves.toMatchObject({
      itemId: 'draft-1', created: false, candidateDigest: created.candidateDigest,
    });
    expect(deps.readDraftRevision).toHaveBeenCalledWith(key.businessId, 'draft-1', 1);
    expect(items.size).toBe(1);
  });

  it('rejects consent supplied by the caller rather than the stored receipt', async () => {
    const deps = ports();
    const untrusted = { ...key, reuse: 'propose_draft' };
    await expect(prepareOwnerLearningDraft(untrusted, deps)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(deps.readReceipt).not.toHaveBeenCalled();
  });
});
