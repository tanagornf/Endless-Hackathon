import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import { expect, it } from 'vitest';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { openOwnerConsult } from '../business-settings/service';
import { saveMessage } from '../inbox/service';
import { createOwnerConsultKnowledgeDraft, deleteKnowledgeItem, getKnowledgeItem } from './service';

it('persists only the separate generalized candidate after real F04 owner consent', async () => {
  const businessId = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!.id;
  const owner = SEED.users.find(({ alias }) => alias === 'owner_a')!;
  const agent = await createTestAgent();
  await loginAs(agent, owner.email);
  const privateRationale = 'Synthetic private rationale ' + randomUUID();
  const customerText = 'Synthetic customer detail ' + randomUUID();
  const approvedCopy = 'We can replace parts for this customer.';
  const title = 'What is the shop policy on replacement parts?';
  const body = 'The shop offers replacement parts for eligible products.';

  for (const reuse of ['case_only', 'propose_draft'] as const) {
    const inbound = await saveMessage({
      businessId, customer: { channel: 'line', externalId: randomUUID() }, direction: 'inbound', author: 'customer',
      parts: [{ type: 'text', text: customerText }], triggerAi: false,
    });
    const opened = await openOwnerConsult({ businessId, conversationId: inbound.conversation.id,
      triggerMessageId: inbound.message.id, question: customerText, language: 'en' });
    const receipt = (await agent.post('/api/v1/businesses/' + businessId + '/settings/owner-consults/' + opened.caseId + '/answer')
      .set('X-Requested-With', 'nless').send({ actionStepId: opened.actionStepId, expectedVersion: opened.version,
        clientRequestId: randomUUID(), answer: approvedCopy, privateRationale, customerReady: true, reuse }).expect(200)).body.data;
    const input = { businessId, caseId: opened.caseId, actionStepId: opened.actionStepId,
      answerReceiptId: receipt.answerReceiptId, title, body };
    const draft = await createOwnerConsultKnowledgeDraft(input);
    if (reuse === 'case_only') {
      expect(draft).toBeNull();
      expect(await createOwnerConsultKnowledgeDraft(input)).toBeNull();
      continue;
    }
    expect(draft).toMatchObject({ revision: 1, created: true });
    try {
      expect(await createOwnerConsultKnowledgeDraft(input)).toMatchObject({
        itemId: draft!.itemId, revision: 1, created: false,
      });
      const item = await getKnowledgeItem(businessId, draft!.itemId);
      expect(item).toMatchObject({ status: 'draft', indexState: 'not_started', source: 'owner-consult', title, body });
      expect(JSON.stringify(item)).not.toContain(privateRationale);
      expect(JSON.stringify(item)).not.toContain(customerText);
      expect(JSON.stringify(item)).not.toContain(approvedCopy);
    } finally { await deleteKnowledgeItem(businessId, { userId: owner.id }, draft!.itemId); }
  }
}, 35_000);
