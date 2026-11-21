import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import type { ShopInstructionCandidate } from '@nless/shared/features/business-settings/types';
import { model, type ModelChatInput } from '../../core';
import { closeDb } from '../../core/db';
import { seedId } from '../../core/seed';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { openOwnerConsult, readShopInstructionAnalysisTarget, recordInstructionReplay, stageShopInstructionCandidate } from '../business-settings/service';
import { saveMessage } from '../inbox/service';
import { generateReply } from './service';

type Owner = Awaited<ReturnType<typeof createTestAgent>>;
type Language = 'th' | 'en';
const shopA = seedId('biz_demo_a');
const shopB = seedId('biz_demo_b');
const modelChat = model.chat.bind(model);
const styles = {
  count: { en: 'How many people will play?', th: 'เล่นกันกี่คนคะ?' },
  age: { en: 'How old are the players?', th: 'ผู้เล่นอายุประมาณเท่าไหร่คะ?' },
  preference: { en: 'Do you prefer quick setup or simple rules?', th: 'อยากได้เกมที่เตรียมเร็วหรือกติกาง่ายคะ?' },
};
const shopPath = (businessId: string) => '/api/v1/businesses/' + businessId + '/settings/shop-instructions';
const requestWrite = (owner: Owner, path: string, data: Record<string, unknown>) =>
  owner.post(path).set('X-Requested-With', 'nless').send(data);

afterEach(() => vi.restoreAllMocks());
afterAll(closeDb);

const inbound = (businessId: string, channel: 'line' | 'web', text: string, conversationId?: string) => saveMessage({
  businessId, conversationId, customer: conversationId ? undefined : { channel, externalId: 'instruction-qa-' + randomUUID() },
  direction: 'inbound', author: 'customer', triggerAi: false, parts: [{ type: 'text', text }],
});

async function stage(owner: Owner, businessId: string, textTh: string, textEn: string): Promise<ShopInstructionCandidate> {
  const text = 'Can you recommend a game for our group?';
  const original = await inbound(businessId, 'line', text);
  const { caseId, actionStepId, version } = await openOwnerConsult({
    businessId, conversationId: original.conversation.id, triggerMessageId: original.message.id, language: 'en', question: text,
  });
  const response = await requestWrite(owner, '/api/v1/businesses/' + businessId + '/settings/owner-consults/' + caseId + '/answer', {
    actionStepId, expectedVersion: version, clientRequestId: randomUUID(), customerReady: true, reuse: 'propose_draft',
    answer: 'We can help choose a game that fits your group.',
  });
  expect(response.status).toBe(200);
  const { answerReceiptId } = response.body.data;
  const activeTarget = await readShopInstructionAnalysisTarget(businessId);
  // A metered fake result supplies the same ownership proof as the internal
  // analysis path, with deterministic copy for this consumer integration test.
  const analyzed = await modelChat({
    model: 'fast', usage: { featureId: 'F04', purpose: 'learning.owner-correction', businessId,
      accountId: seedId(businessId === shopA ? 'account_demo_a' : 'account_demo_b'),
      conversationId: original.conversation.id, turnId: answerReceiptId },
    messages: [{ role: 'user', content: 'Test-only scoped correction fixture' }],
    fake: { json: { ...activeTarget, caseId, action: 'instruction_revise', textTh, textEn, reason: 'Ask the shop preference first' } },
  });
  const candidate = await stageShopInstructionCandidate({ businessId, caseId, actionStepId, answerReceiptId }, {
    usageId: analyzed.usageId, finishReason: analyzed.finishReason, json: analyzed.json,
  });
  expect(candidate).not.toBeNull();
  await inbound(businessId, 'line', 'I have another question now.', original.conversation.id);
  return candidate!;
}

async function publish(owner: Owner, businessId: string, candidate: ShopInstructionCandidate) {
  const replay = await recordInstructionReplay({
    businessId, candidateId: candidate.id, baseVersionId: candidate.baseVersionId, candidateDigest: candidate.candidateDigest,
    replayRunId: randomUUID(), fixtureSetDigest: 'a'.repeat(64), mode: 'fake',
    outcomes: [
      { fixtureId: 'original', language: 'th', arm: 'baseline', expectedCase: 'preference', actualResult: 'default', passed: false },
      { fixtureId: 'original', language: 'th', arm: 'candidate', expectedCase: 'preference', actualResult: 'preference', passed: true },
      { fixtureId: 'rephrase', language: 'en', arm: 'candidate', expectedCase: 'preference', actualResult: 'preference', passed: true },
      { fixtureId: 'price', language: 'en', arm: 'negative', expectedCase: 'guard', actualResult: 'guard', passed: true },
      { fixtureId: 'shop-b', language: 'th', arm: 'cross_shop', expectedCase: 'other', actualResult: 'other', passed: true },
    ],
  });
  expect(replay.passed).toBe(true);
  const response = await requestWrite(owner, shopPath(businessId) + '/candidates/' + candidate.id + '/publish', {
    expectedActiveVersionId: candidate.baseVersionId,
  });
  expect(response.status).toBe(200);
  return response.body.data.id as string;
}

async function rollback(owner: Owner, businessId: string, version: string, expectedActiveVersionId: string) {
  const response = await requestWrite(owner, shopPath(businessId) + '/versions/' + version + '/rollback', { expectedActiveVersionId });
  expect(response.status).toBe(200);
  return response.body.data.id as string;
}

async function ask(businessId: string, language: Language, question?: string) {
  const text = question ?? (language === 'th' ? 'ช่วยแนะนำเกมสำหรับกลุ่มของเราหน่อยค่ะ' : 'Please recommend a game for our group.');
  const saved = await inbound(businessId, 'web', text);
  const reply = await generateReply(saved.conversation.id, { triggerMessageId: saved.message.id });
  return reply.reply.parts.flatMap((part) => part.type === 'text' ? [part.text] : []).join('\n');
}

it('applies only the authorized shop active instruction and restores the previous and baseline behavior', async () => {
  const [ownerA, ownerB] = await Promise.all([createTestAgent(), createTestAgent()]);
  await Promise.all([loginAs(ownerA, 'owner.a@example.test'), loginAs(ownerB, 'owner.b@example.test')]);
  const prompts: { businessId: string | null; prompt: string }[] = [];
  vi.spyOn(model, 'chat').mockImplementation((request: ModelChatInput) => {
    if (!['reply', 'repair'].includes(request.usage.purpose)) return modelChat(request);
    const prompt = String(request.messages[1]?.content);
    prompts.push({ businessId: request.usage.businessId, prompt });
    const language = prompt.includes('Reply language: th') ? 'th' : 'en';
    const latest = String(request.messages.findLast(({ role }) => role === 'user')?.content);
    const approach = prompt.includes('quick setup versus simple rules') ? 'preference' : prompt.includes('players age first') ? 'age' : 'count';
    const text = latest.includes('A-GAME-01') ? 'The game costs 7 baht.' : styles[approach][language];
    return modelChat({ ...request, fake: { text } });
  });

  let activeA: string | null = null;
  let activeB: string | null = null;
  try {
    const a = await stage(ownerA, shopA, 'ถามจำนวนผู้เล่นก่อน', 'Ask player count first.');
    expect(await ask(shopA, 'en')).toBe(styles.count.en);
    expect(prompts.at(-1)?.prompt).not.toContain('Ask player count first.');
    activeA = await publish(ownerA, shopA, a);
    const originalA = activeA;
    const b = await stage(ownerB, shopB, 'ถามอายุผู้เล่นก่อน', 'Ask players age first.');
    activeB = await publish(ownerB, shopB, b);
    const replacement = await stage(ownerA, shopA, 'ถามว่าชอบเตรียมเร็วหรือกติกาง่าย', 'Ask quick setup versus simple rules first.');

    expect(await ask(shopA, 'en')).toBe(styles.count.en);
    expect(prompts.at(-1)?.prompt).not.toContain('quick setup versus simple rules');
    activeA = await publish(ownerA, shopA, replacement);
    expect(await ask(shopA, 'en')).toBe(styles.preference.en);
    expect(await ask(shopA, 'th')).toBe(styles.preference.th);
    expect(await ask(shopB, 'th')).toBe(styles.age.th);
    expect(prompts.at(-1)?.prompt).not.toContain('quick setup versus simple rules');
    const price = await ask(shopA, 'en', 'How much is A-GAME-01?');
    expect(price).toContain('1,490 baht');
    expect(price).not.toContain('7 baht');

    activeA = await rollback(ownerA, shopA, originalA, activeA);
    expect(await ask(shopA, 'th')).toBe(styles.count.th);
    expect(prompts.at(-1)?.prompt).toContain('Ask player count first.');
    await rollback(ownerA, shopA, 'baseline', activeA);
    activeA = null;
    expect(await ask(shopA, 'en')).toBe(styles.count.en);
    expect(prompts.at(-1)?.prompt).not.toContain('Owner-approved reply preference');
    expect(await ask(shopB, 'en')).toBe(styles.age.en);
  } finally {
    if (activeA) await rollback(ownerA, shopA, 'baseline', activeA);
    if (activeB) await rollback(ownerB, shopB, 'baseline', activeB);
  }
}, 120_000);
