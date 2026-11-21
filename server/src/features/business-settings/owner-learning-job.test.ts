import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { db, drainJobs, jobs, model } from '../../core';
import { seedId } from '../../core/seed';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { saveMessage } from '../inbox/service';
import { deleteKnowledgeItem, getKnowledgeItem } from '../knowledge/service';
import { searchKnowledge } from '../knowledge-search/service';
import { openOwnerConsult } from './service';
import { ownerLearningJob, ownerLearningSchedule } from './owner-learning-job';

it('dispatches only consenting receipts and makes the reviewed FAQ searchable in the originating shop', async () => {
  const shop = seedId('biz_demo_a');
  const other = seedId('biz_demo_b');
  const owner = await createTestAgent();
  await loginAs(owner, 'owner.a@example.test');
  const privateNote = 'Owner note ' + randomUUID();
  const buyerReference = randomUUID();
  const asked = 'Does the shop replace a Lumistag clip for order ' + buyerReference + '?';
  const answer = 'The shop can replace a broken Lumistag clip.';
  const analyze = vi.spyOn(model, 'analyzeShopCorrection').mockImplementation(async input => {
    expect(input.redactedInput).not.toContain(privateNote);
    expect(input.redactedInput).not.toContain(buyerReference);
    const { caseId, expectedVersion } = JSON.parse(input.redactedInput);
    return { text: '', requestId: null, toolCalls: [], finishReason: 'stop', latencyMs: 1, model: 'fake', mode: 'fake', usageId: randomUUID(),
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, costUsdMicros: 0, costReason: 'fake_mode' }, json: {
      action: 'knowledge_add', caseId, expectedVersion, targetId: null,
      textTh: 'การเปลี่ยนคลิป Lumistag\nร้านรับเปลี่ยนคลิป Lumistag ที่หัก',
      textEn: 'Lumistag clip replacements\nThe shop replaces broken Lumistag clips.', reason: 'Shop policy.',
    } };
  });
  const root = '/api/v1/businesses/' + shop;
  let itemId: string | undefined;
  try {
    const receipts: string[] = [];
    for (const reuse of ['case_only', 'propose_draft']) {
      const inbound = await saveMessage({ businessId: shop, customer: { channel: 'line', externalId: randomUUID() },
        direction: 'inbound', author: 'customer', parts: [{ type: 'text', text: asked }], triggerAi: false });
      const opened = await openOwnerConsult({ businessId: shop, conversationId: inbound.conversation.id,
        triggerMessageId: inbound.message.id, question: asked, language: 'en' });
      const body = { actionStepId: opened.actionStepId, expectedVersion: opened.version, clientRequestId: randomUUID(),
        customerReady: true, answer, privateRationale: privateNote, reuse };
      const submit = () => owner.post(root + '/settings/owner-consults/' + opened.caseId + '/answer')
        .set('X-Requested-With', 'nless').send(body).expect(200);
      const receipt = (await submit()).body.data.answerReceiptId;
      expect((await submit()).body.data.answerReceiptId).toBe(receipt);
      receipts.push(receipt);
    }

    for (let tick = 0; tick < 2; tick++) {
      await jobs.enqueue(ownerLearningSchedule.name, { slot: new Date().toISOString() });
      expect((await drainJobs({ type: ownerLearningSchedule.name })).dead).toBe(0);
    }
    const { rows } = await db.query<{ payload: { answerReceiptId: string } }>(
      'SELECT payload FROM jobs WHERE type=$1 AND payload->>\'answerReceiptId\'=ANY($2::text[])', [ownerLearningJob, receipts]);
    expect(rows.map(row => row.payload.answerReceiptId)).toEqual([receipts[1]]);
    expect(JSON.stringify(rows)).not.toContain(buyerReference);
    expect((await drainJobs({ type: ownerLearningJob })).dead).toBe(0);
    expect(analyze).toHaveBeenCalled();
    const stored = await db.one<{ id: string }>("SELECT id FROM knowledge_items WHERE business_id=$1 AND source='owner-consult' AND client_request_id=$2",
      [shop, 'owner-consult:' + receipts[1]]);
    itemId = stored.id;
    const draft = await getKnowledgeItem(shop, itemId);
    if (!draft) throw new Error('Expected a stored draft');
    expect(draft).toMatchObject({ status: 'draft', indexState: 'not_started', title: 'การเปลี่ยนคลิป Lumistag / Lumistag clip replacements' });
    expect(JSON.stringify(draft)).not.toContain(buyerReference);
    expect(JSON.stringify(draft)).not.toContain(privateNote);
    const query = 'Lumistag clip replacements';
    const refs = async (tenant: string) => (await searchKnowledge(tenant, query)).hits.map(hit => hit.knowledgeItemId);
    expect(await refs(shop)).not.toContain(itemId);
    await owner.post(root + '/knowledge/items/' + itemId + '/activate').set('X-Requested-With', 'nless')
      .send({ expectedRevision: draft.revision }).expect(200);
    await drainJobs({ type: 'knowledge.index', maxMs: 20_000 });
    expect(await refs(shop)).toContain(itemId);
    expect(await refs(other)).not.toContain(itemId);
  } finally {
    analyze.mockRestore();
    if (itemId) await deleteKnowledgeItem(shop, { userId: seedId('owner_a') }, itemId);
  }
}, 60_000);
