import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import type { MessagePart } from '@nless/shared/core/types';
import type { SaveMessageResult } from '@nless/shared/features/inbox/types';
import type { PaymentRequestDetail } from '@nless/shared/features/payments/types';
import { db, model, storage } from '../../core';
import { closeDb } from '../../core/db';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { getHistory, saveMessage } from '../inbox/service';
import { createOrderFromProposal, getOrderForPayment } from '../orders/service';
import { createPaymentRequestForOrder, makeSlipQrPayload, submitLineSlip } from '../payments/service';
import { runAiTurn } from './turn';

const businessId = SEED.businesses[0].id;
const sku = 'F10-IMG-' + randomUUID().slice(0, 8).toUpperCase();
const originalChat = model.chat.bind(model);
let admin: Awaited<ReturnType<typeof createTestAgent>>;

beforeAll(async () => {
  admin = await createTestAgent();
  await loginAs(admin, 'owner.a@example.test');
  const product = await admin.post('/api/v1/businesses/' + businessId + '/catalog/items').set('X-Requested-With', 'nless')
    .send({ sku, kind: 'product', name: 'เกมทดสอบรูป', nameEn: 'Image test game', priceMinor: 149000, stock: 8, shippable: true });
  expect(product.status).toBe(201);
});
afterEach(() => vi.restoreAllMocks());
afterAll(closeDb);

function incoming(parts: MessagePart[], thread?: SaveMessageResult) {
  return saveMessage({
    businessId, conversationId: thread?.conversation.id,
    customer: thread ? undefined : { channel: 'line', externalId: 'image-' + randomUUID() },
    author: 'customer', direction: 'inbound', origin: 'live', parts, triggerAi: false,
  });
}

async function picture(bytes: Uint8Array, thread?: SaveMessageResult) {
  const file = await storage.save({
    businessId, uploadedBy: null, purpose: 'test-line-media', originalName: 'fixture.png', mimeType: 'image/png', bytes,
  });
  return { file, inbound: await incoming([{ type: 'image', fileId: file.id, alt: 'Fixture' }], thread) };
}

function execute(inbound: SaveMessageResult) {
  return runAiTurn(inbound.conversation.id, { triggerMessageId: inbound.message.id, businessId, deliver: true });
}

async function readPayment(id: string): Promise<PaymentRequestDetail> {
  const response = await admin.get('/api/v1/businesses/' + businessId + '/payments/' + id);
  expect(response.status).toBe(200);
  return response.body.data;
}

async function payable(thread: SaveMessageResult) {
  const conversationId = thread.conversation.id;
  const quote = await createOrderFromProposal({
    stage: 'propose', businessId, conversationId, items: [{ ref: { sku }, quantity: 1 }],
    deliveryMethod: 'pickup', clientRequestId: 'quote:' + randomUUID(),
  });
  if (quote.stage !== 'propose') throw Error('Expected proposal');
  const result = await createOrderFromProposal({
    stage: 'confirm', businessId, conversationId, actor: { kind: 'customer' }, proposalId: quote.proposal.id,
    version: quote.proposal.version, reviewToken: quote.proposal.reviewToken, clientRequestId: 'yes:' + randomUUID(), decision: 'confirm',
  });
  if (result.stage !== 'confirm' || !result.order) throw Error('Expected order');
  const payment = await createPaymentRequestForOrder(businessId, result.order.id);
  return { order: result.order, payment };
}

const paymentImage = { kind: 'payment_slip', visibleText: '', description: '', question: null };
function slipOcr(reference: string, amount: string, transferredAt: string) {
  return {
    is_transfer_slip: true, amount_text: amount, transferred_at_iso: transferredAt, transaction_ref: reference,
    sending_bank: null, receiver_bank: null, sender_name: null, receiver_name: SEED.businesses[0].name,
    receiver_account_masked: 'xxx-xxx-5678', legibility: .96, tamper_suspected: false, tamper_note: null,
  };
}

it('uses the previous LINE photo with its following question and grounds the price in the catalog', async () => {
  const bytes = await sharp({ create: { width: 48, height: 48, channels: 3, background: 'white' } }).png().toBuffer();
  const { file, inbound } = await picture(bytes);
  const question = await incoming([{ type: 'text', text: 'How much is this one?' }], inbound);
  const calls = vi.spyOn(model, 'chat').mockImplementation((input) => {
    if (input.usage.purpose === 'customer_image') return originalChat({
      ...input, fake: { json: { kind: 'photo', visibleText: sku, description: 'A board game box', question: 'How much is ' + sku + '?' } },
    });
    // A price from a model response still has to pass the normal F10 guard.
    if (input.usage.purpose === 'reply') return originalChat({ ...input, fake: { text: 'This game costs 9 baht.' } });
    return originalChat(input);
  });
  const turn = await execute(question);
  expect(turn.response.reply.parts).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'text', text: expect.stringMatching(/1,490|1490/) }),
  ]));
  expect(turn.response.proposal).toBeUndefined();
  const read = calls.mock.calls.find(([input]) => input.usage.purpose === 'customer_image')?.[0];
  expect(read?.messages).toContainEqual(expect.objectContaining({
    role: 'user', content: expect.arrayContaining([{ type: 'image', uploadRef: file.id, detail: 'high' },
      { type: 'text', text: expect.stringContaining('How much is this one?') }]),
  }));
  expect((await getHistory(inbound.conversation.id, { businessId })).items.find((msg) => msg.id === inbound.message.id)?.parts)
    .toEqual([{
      type: 'image', fileId: file.id, alt: 'Fixture',
      url: '/api/v1/businesses/' + businessId + '/chat/files/' + file.id,
    }]);
});

it('asks what the customer would like to know for an image with no clear request', async () => {
  const bytes = await sharp({ create: { width: 48, height: 48, channels: 3, background: 'white' } }).png().toBuffer();
  const { inbound } = await picture(bytes);
  vi.spyOn(model, 'chat').mockImplementation((input) => originalChat({
    ...input, fake: { json: { kind: 'photo', visibleText: sku, description: 'A board game box', question: null } },
  }));
  const turn = await execute(inbound);
  expect(turn.response.reply.parts[0]).toMatchObject({ type: 'text', text: expect.stringContaining('อยากให้ร้านช่วย') });
});

it('stores exactly one checked slip for the confirmed order and leaves payment pending until staff confirms', async () => {
  const thread = await incoming([{ type: 'text', text: 'Here is my payment slip.' }]);
  const { order, payment } = await payable(thread);
  const reference = 'DEMO' + randomUUID().replace(/-/g, '').slice(0, 15).toUpperCase();
  const received = new Date().toISOString();
  const bytes = await QRCode.toBuffer(makeSlipQrPayload(reference), { width: 250 });
  const { inbound } = await picture(bytes, thread);
  const calls = vi.spyOn(model, 'chat').mockImplementation((input) => {
    if (input.usage.purpose === 'customer_image') return originalChat({ ...input, fake: { json: paymentImage } });
    if (input.usage.purpose === 'slip-read') return originalChat({ ...input, fake: { json: slipOcr(reference, '1490.00', received) } });
    return originalChat(input);
  });
  const result = await execute(inbound);
  expect(result.response.reply.parts[0]).toMatchObject({ type: 'text', text: expect.stringContaining('shop will check') });
  const detail = await readPayment(payment.id);
  expect(detail.state).toBe('pending_verification');
  expect(detail.slips).toHaveLength(1);
  const [slip] = detail.slips;
  expect(slip).toMatchObject({ verdict: 'verified', amountMinor: payment.amountMinor, staffDecision: null });
  expect(JSON.stringify(detail)).not.toContain(reference);
  expect((await getOrderForPayment(businessId, order.id)).paymentState).toBe('pending_verification');
  await execute(inbound);
  expect(calls.mock.calls.filter(([input]) => input.usage.purpose === 'slip-read')).toHaveLength(1);
  const endpoint = '/api/v1/businesses/' + businessId + '/payments/' + payment.id + '/slips/' + slip.id + '/review';
  const review = (body: object) => admin.post(endpoint).set('X-Requested-With', 'nless').send(body);
  expect((await review({ decision: 'accepted' })).status).toBe(400);
  const approved = await review({ decision: 'accepted', bankConfirmed: true });
  expect(approved.status).toBe(200);
  expect(approved.body.data).toMatchObject({ state: 'paid', paidBy: 'staff_accept', receipt: { mode: 'sandbox' } });
  expect((await review({ decision: 'accepted', bankConfirmed: true })).status).toBe(200);
  const token = new URL(payment.payUrl).pathname.split('/').at(-1)!;
  const publicView = await admin.get('/api/v1/public/payments/' + token);
  expect(publicView.status).toBe(200);
  expect(publicView.body.data).toMatchObject({ state: 'paid', receipt: { receiptNo: approved.body.data.receipt.receiptNo } });
});

it('asks for an order number when two same-chat requests are payable and rejects a mismatched file', async () => {
  const thread = await incoming([{ type: 'text', text: 'Here is my payment slip.' }]);
  const first = await payable(thread);
  const second = await payable(thread);
  const bytes = await sharp({ create: { width: 48, height: 48, channels: 3, background: 'white' } }).png().toBuffer();
  const { file, inbound } = await picture(bytes, thread);
  const spy = vi.spyOn(model, 'chat').mockImplementation((input) => originalChat({ ...input, fake: { json: paymentImage } }));
  const result = await execute(inbound);
  expect(result.response.reply.parts[0]).toMatchObject({ type: 'text', text: expect.stringContaining('order number') });
  expect(spy.mock.calls.some(([input]) => input.usage.purpose === 'slip-read')).toBe(false);
  expect(await readPayment(first.payment.id)).toMatchObject({ state: 'open', slips: [] });
  expect(await readPayment(second.payment.id)).toMatchObject({ state: 'open', slips: [] });
  expect(await submitLineSlip(inbound.conversation, inbound.message, randomUUID(), 'en', new AbortController().signal)).toBe(false);
  const alert = await db.maybeOne('SELECT id FROM notifications WHERE business_id = $1 AND dedup_key = $2',
    [businessId, 'f14-line-slip:' + businessId + ':' + file.id]);
  expect(alert).toBeTruthy();
});
