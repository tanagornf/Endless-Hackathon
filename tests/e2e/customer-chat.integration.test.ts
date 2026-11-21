import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import sharp from 'sharp';
import { afterAll, afterEach, expect, test, vi } from 'vitest';
import type { DemoChatPoll, DemoChatMessage } from '@nless/shared/features/inbox/types';
import type { KnowledgeItemRow } from '@nless/shared/features/knowledge/types';
import { model } from '../../server/src/core';
import { closeDb } from '../../server/src/core/db';
import { seedId } from '../../server/src/core/seed';
import { createTestAgent, drainJobs, loginAs } from '../../server/src/core/test-utils';

const shop = '/api/v1/businesses/' + seedId('biz_demo_a');
const publicChat = '/api/v1/public/demo-chat/demo-boardgame';
const knowledge = shop + '/knowledge/items';
const catalogItem = shop + '/catalog/items/' + seedId('item_a_game');
const writeHeader = { 'X-Requested-With': 'nless' };

async function ownerSession() {
  const owner = await createTestAgent();
  await loginAs(owner, 'owner.a@example.test');
  return owner;
}

// Each call is a different visitor with an empty cookie jar and an actual F09 session.
async function ask(question: string) {
  const visitor = await createTestAgent();
  await visitor.post(publicChat + '/session').send({}).expect(200);
  const sent = await visitor.post(publicChat + '/messages').send({ text: question, clientRequestId: randomUUID() }).expect(200);
  expect((await drainJobs()).dead).toBe(0);
  const result = await visitor.get(publicChat + '/poll').query({ waitMs: 0 }).expect(200);
  const poll: DemoChatPoll = result.body.data;
  expect(poll.conversationId).toBe(sent.body.data.conversationId);
  const replies = poll.items.filter(row => row.author === 'ai');
  expect(replies).toHaveLength(1);
  return { visitor, reply: replies[0], conversationId: poll.conversationId };
}

function textOf(message: DemoChatMessage) {
  return message.parts.flatMap(part => part.type === 'text' ? [part.text] : []).join(' ');
}

afterEach(() => vi.restoreAllMocks());
afterAll(closeDb);

test('a buyer sees a sourced product fact and the next buyer sees the merchant correction without another web call', async () => {
  const owner = await ownerSession();
  const search = vi.spyOn(model, 'searchWeb');
  const url = 'https://standards.example/manuals/usb-type-c';
  const provisional = 'USB-C has a reversible plug.';
  const corrected = 'The USB-C connector fits in either orientation.';
  search.mockImplementation(async ({ signal }) => {
    // Match the observed 8.78 s provider latency and honor the actual turn's cancellation signal.
    await wait(8780, undefined, { signal });
    return { answer: provisional, citations: [{ title: 'Synthetic USB Type-C guide', url }], usageId: randomUUID() };
  });

  async function drafts() {
    const list = await owner.get(knowledge).query({ status: 'draft', limit: 200 }).expect(200);
    return list.body.data.items as KnowledgeItemRow[];
  }
  const before = new Set((await drafts()).map(item => item.id));
  const question = 'What is USB-C?';
  const firstStartedAt = performance.now();
  const first = await ask(question);
  console.info('Sourced answer round trip', Math.round(performance.now() - firstStartedAt), 'ms');
  expect(search).toHaveBeenCalledTimes(1);
  expect(textOf(first.reply)).toContain(provisional);
  expect(JSON.stringify(first.reply.parts)).toContain(url);
  const added = (await drafts()).filter(item => !before.has(item.id));
  expect(added).toHaveLength(1);
  const detail = knowledge + '/' + added[0].id;
  try {
    const draft = await owner.get(detail).expect(200);
    expect(draft.body.data.status).toBe('draft');
    expect(JSON.stringify(draft.body.data)).toContain(url);
    const edited = await owner.patch(detail).set(writeHeader)
      .send({ expectedRevision: draft.body.data.revision, body: corrected }).expect(200);
    const revision = edited.body.data.revision;
    await owner.post(detail + '/submit').set(writeHeader).send({ expectedRevision: revision }).expect(200);
    expect((await drainJobs()).dead).toBe(0);
    const approval = await owner.post(detail + '/activate').set(writeHeader).send({ expectedRevision: revision }).expect(200);
    expect(approval.body.data.status).toBe('active');
    const repeat = await ask(question);
    expect(repeat.conversationId).not.toBe(first.conversationId);
    expect(textOf(repeat.reply)).toContain(corrected);
    expect(textOf(repeat.reply)).not.toContain(provisional);
    expect(search).toHaveBeenCalledTimes(1);
  } finally {
    await owner.delete(detail).set(writeHeader).expect(200);
  }
}, 40000);

test('a buyer receives sourced prose when inline provider links make the raw answer longer than 650 characters', async () => {
  const owner = await ownerSession();
  const url = 'https://standards.example/specifications/' + 'magnetic-alignment/'.repeat(12) + 'guide';
  const prose = 'Qi2 uses magnetic alignment for wireless charging.';
  const citation = '[Standards guide](' + url + ')';
  const raw = [prose, citation, 'A transmitter and receiver align with each other.', citation,
    'That alignment helps position the charging coils.', citation].join(' ');
  expect(raw.length).toBeGreaterThan(650);
  const search = vi.spyOn(model, 'searchWeb').mockResolvedValue({
    answer: raw, citations: [{ title: 'Standards guide', url }], usageId: randomUUID(),
  });
  const { reply } = await ask('What is Qi2?');
  expect(search).toHaveBeenCalledTimes(1);
  expect(textOf(reply)).toContain(prose);
  expect(reply.parts.some(part => part.type === 'text' && part.text.includes(url))).toBe(true);
  const list = await owner.get(knowledge).query({ status: 'draft', limit: 200 }).expect(200);
  const draft = (list.body.data.items as KnowledgeItemRow[]).find(row => row.source === 'web' && row.title.includes('Qi2'));
  expect(draft).toBeDefined();
  await owner.delete(knowledge + '/' + draft!.id).set(writeHeader).expect(200);
}, 20000);

test('an unknown SKU stays on the local catalog path', async () => {
  const search = vi.spyOn(model, 'searchWeb');
  const { reply } = await ask('How much is A-UNKNOWN-73 and how many do you have in stock?');
  expect(search).not.toHaveBeenCalled();
  expect(textOf(reply)).toContain("couldn't find that product");
  expect(textOf(reply)).not.toMatch(/1,?490/);
  expect(reply.parts.some(part => part.type === 'image')).toBe(false);
}, 20000);

test('a known SKU uses the catalog price without a web search', async () => {
  const search = vi.spyOn(model, 'searchWeb');
  const { reply } = await ask('How much is A-GAME-01?');
  expect(textOf(reply)).toMatch(/1,490\b/);
  expect(search).not.toHaveBeenCalled();
}, 20000);

test('a sold-out SKU uses the catalog stock status without a web search', async () => {
  const search = vi.spyOn(model, 'searchWeb');
  const soldOut = await ask('Is A-SOLD-01 in stock?');
  expect(textOf(soldOut.reply)).toMatch(/sold out|out of stock/i);
  expect(search).not.toHaveBeenCalled();
}, 20000);

test.each([
  ['direct photo request', 'Show me a picture of A-GAME-01.'],
  ['catalog price reply', 'How much is A-GAME-01?'],
])('the visitor can fetch the merchant-uploaded product photo from a %s', async (_scenario, question) => {
  const owner = await ownerSession();
  const search = vi.spyOn(model, 'searchWeb');
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#236155' } }).png().toBuffer();
  const upload = await owner.post(catalogItem + '/images').set(writeHeader)
    .field('alt', 'Synthetic Demo Quest box').attach('file', png, { filename: 'demo-quest.png', contentType: 'image/png' });
  expect([200, 201]).toContain(upload.status);
  const item = await owner.get(catalogItem).expect(200);
  const photo = item.body.data.images.find((image: { alt: string }) => image.alt === 'Synthetic Demo Quest box');
  expect(photo).toBeDefined();
  try {
    const { visitor, reply } = await ask(question);
    expect(reply.parts).toContainEqual(expect.objectContaining({ type: 'image', fileId: photo.fileId }));
    const attachment = await visitor.get(publicChat + '/files/' + photo.fileId).expect(200);
    expect(attachment.headers['content-type']).toMatch(/^image\//);
    expect(Buffer.isBuffer(attachment.body)).toBe(true);
    expect(attachment.body.length).toBeGreaterThan(0);
    expect(search).not.toHaveBeenCalled();
  } finally {
    const removed = await owner.delete(catalogItem + '/images/' + photo.id).set(writeHeader);
    expect([200, 204]).toContain(removed.status);
  }
}, 30000);

test('a product without a stored picture returns a text explanation without an attachment or web search', async () => {
  const search = vi.spyOn(model, 'searchWeb');
  const { reply } = await ask('Show me a picture of A-CARD-01.');
  expect(textOf(reply)).toMatch(/could not find a shop photo/i);
  expect(reply.parts.every(part => part.type === 'text')).toBe(true);
  expect(search).not.toHaveBeenCalled();
}, 20000);
