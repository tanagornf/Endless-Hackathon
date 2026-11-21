import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import type { MessagePart } from '@nless/shared/core/types';
import { afterAll, expect, test, vi } from 'vitest';
import { saveMessage } from '../features/inbox/service';
import { ChannelSendError, registerChannelSender, sendToCustomer } from './channels';
import { closeDb, db } from './db';
import { AppError } from './errors';
import { jobs } from './jobs';
import * as jobHandlers from './jobs';
import type { DeliveryResult, OutboundDelivery } from './types';
import { settleCancelledDelivery } from './outbox';
import { drainJobs } from './worker';

afterAll(closeDb);

const { id: businessId } = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!;
const parts: MessagePart[] = [{ type: 'text', text: 'Synthetic outbox fixture' }];

async function queueDelivery() {
  const inbound = await saveMessage({
    businessId, customer: { channel: 'web', externalId: randomUUID() }, direction: 'inbound',
    author: 'customer', parts, triggerAi: false,
  });
  return sendToCustomer(inbound.conversation.id, parts, { businessId, author: 'system' });
}

const deliveryState = (messageId: string) => db.one(
  'SELECT delivery_state AS state, delivery_error AS error, delivery_external_ref AS ref FROM messages WHERE id=$1 AND business_id=$2',
  [messageId, businessId],
);
const drain = () => drainJobs({ type: 'core.deliver' });

test.each(['returned', 'thrown'])('explicitly undelivered %s failure is safely retried from a new checkpoint', async (failure) => {
  const observed: unknown[] = [];
  const send = vi.fn(async (delivery: OutboundDelivery): Promise<DeliveryResult> => {
    observed.push(await deliveryState(delivery.messageId));
    if (delivery.attempt === 1) {
      if (failure === 'thrown') throw new ChannelSendError('Synthetic temporary failure', {
        code: 'RATE_LIMITED', definitelyNotSent: true, retryable: true,
      });
      return { state: 'failed', retryable: true, mode: 'real', error: 'RATE_LIMITED' };
    }
    return { state: 'sent', mode: 'real', externalRef: 'synthetic receipt' };
  });
  registerChannelSender('web', { channel: 'web', mode: 'real', send });
  const { jobId, messageId } = await queueDelivery();
  await drain();
  expect(observed).toEqual([{ state: 'pending', error: 'inflight:1', ref: null }]);
  expect(await deliveryState(messageId)).toEqual({ state: 'pending', error: 'retry:RATE_LIMITED', ref: null });
  expect(await jobs.get(jobId)).toMatchObject({ state: 'queued', attempts: 1 });
  await db.query('UPDATE jobs SET run_at=now() WHERE id=$1', [jobId]);
  await drain();
  expect(observed[1]).toEqual({ state: 'pending', error: 'inflight:2', ref: null });
  expect(await deliveryState(messageId)).toEqual({ state: 'sent', error: null, ref: 'synthetic receipt' });
  expect(await jobs.get(jobId)).toMatchObject({ state: 'succeeded', attempts: 2 });
}, 20_000);

test.each([false, true])('expired in-flight delivery becomes unknown without replay (last attempt %s)', async (lastAttempt) => {
  const send = vi.fn(async () => ({ state: 'sent', mode: 'real' } as const));
  registerChannelSender('web', { channel: 'web', mode: 'real', send });
  const { jobId, messageId } = await queueDelivery();
  await db.query("UPDATE messages SET delivery_error='inflight:1' WHERE id=$1", [messageId]);
  await db.query("UPDATE jobs SET state='running',attempts=1,max_attempts=$2,locked_until=now()-interval '1 second',claim_token=gen_random_uuid() WHERE id=$1",
    [jobId, lastAttempt ? 1 : 5]);
  await drain();
  expect(send).not.toHaveBeenCalled();
  expect(await deliveryState(messageId)).toMatchObject({ state: 'unknown', ref: null });
  expect(await jobs.get(jobId)).toMatchObject({ state: lastAttempt ? 'dead' : 'succeeded' });
  await drain();
  expect(send).not.toHaveBeenCalled();
  expect(await db.one("SELECT count(*)::int AS count FROM audit_events WHERE business_id=$1 AND target_id=$2 AND action='core.delivery.unknown'",
    [businessId, messageId])).toEqual({ count: 1 });
}, 20_000);

test.each([
  { failure: 'explicit unknown', state: 'unknown', error: 'PROVIDER_TIMEOUT' },
  { failure: 'unexpected throw', state: 'unknown', error: 'CHANNEL_DELIVERY_ERROR' },
  { failure: 'certain rejection', state: 'failed', error: 'CHANNEL_REJECTED' },
])('terminal delivery status from $failure stays accurate without a retry', async ({ failure, state, error }) => {
  const send = vi.fn(async (): Promise<DeliveryResult> => {
    if (failure === 'unexpected throw') throw new Error('Synthetic ambiguous disconnect');
    if (failure === 'certain rejection') {
      throw new ChannelSendError('Synthetic terminal rejection', { code: error, definitelyNotSent: true, retryable: false });
    }
    return { state: 'unknown', mode: 'real', error };
  });
  registerChannelSender('web', { channel: 'web', mode: 'real', send });
  const { jobId, messageId } = await queueDelivery();
  await drain();
  await drain();
  expect(send).toHaveBeenCalledTimes(1);
  expect(await deliveryState(messageId)).toEqual({ state, error, ref: null });
  expect(await jobs.get(jobId)).toMatchObject({ state: 'succeeded', attempts: 1 });
}, 20_000);

test.each([
  { path: 'expired', marker: null, final: 'failed' },
  { path: 'expired', marker: 'retry:line_503', final: 'unknown' },
  { path: 'ordinary', marker: null, final: 'failed' },
  { path: 'ordinary', marker: 'retry:UNCERTAIN_LINE_503', final: 'unknown' },
])('a $path final failure settles a pending delivery as $final', async ({ path, marker, final }) => {
  const send = vi.fn(async () => ({ state: 'sent', mode: 'real' } as const));
  registerChannelSender('web', { channel: 'web', mode: 'real', send });
  const { jobId, messageId } = await queueDelivery();
  await db.query('UPDATE messages SET delivery_error=$2 WHERE id=$1', [messageId, marker]);
  if (path === 'expired') {
    await db.query("UPDATE jobs SET state='running',attempts=1,max_attempts=1,locked_until=now()-interval '1 second',claim_token=gen_random_uuid() WHERE id=$1",
      [jobId]);
    await drain();
  } else {
    const handler = vi.spyOn(jobHandlers, 'getJobHandler').mockReturnValue(async () => {
      throw new AppError('POLICY_BLOCKED', 'Synthetic terminal handler failure');
    });
    try { await drain(); } finally { handler.mockRestore(); }
  }
  expect(send).not.toHaveBeenCalled();
  expect(await jobs.get(jobId)).toMatchObject({ state: 'dead' });
  expect(await deliveryState(messageId)).toMatchObject({ state: final, ref: null });
}, 20_000);

test('a failed enqueue records a definite failure, and only that marker reopens on idempotent retry', async () => {
  const inbound = await saveMessage({
    businessId, customer: { channel: 'web', externalId: randomUUID() }, direction: 'inbound',
    author: 'customer', parts, triggerAi: false,
  });
  const conversationId = inbound.conversation.id;
  const stored = await saveMessage({
    businessId, conversationId, direction: 'outbound', author: 'system', parts, triggerAi: false,
  });
  const messageId = stored.message.id;
  const send = vi.fn(async () => ({ state: 'sent', mode: 'real' } as const));
  registerChannelSender('web', { channel: 'web', mode: 'real', send });
  const enqueue = vi.spyOn(jobHandlers, 'enqueueJob').mockRejectedValueOnce(new Error('Synthetic enqueue failure'));
  try {
    await expect(sendToCustomer(conversationId, parts, { businessId, messageId })).rejects.toThrow('Synthetic enqueue failure');
  } finally { enqueue.mockRestore(); }
  expect(await deliveryState(messageId)).toMatchObject({ state: 'failed', error: 'DELIVERY_ENQUEUE_FAILED' });
  expect(await db.maybeOne('SELECT id FROM jobs WHERE dedup_key=$1', ['deliver:' + messageId])).toBeNull();

  const retried = await sendToCustomer(conversationId, parts, { businessId, messageId });
  const duplicate = await sendToCustomer(conversationId, parts, { businessId, messageId });
  expect(duplicate.jobId).toBe(retried.jobId);
  await drain();
  expect(send).toHaveBeenCalledTimes(1);
  expect(await deliveryState(messageId)).toMatchObject({ state: 'sent' });
}, 20_000);

test('cancelling one job leaves a scoped delivery pending when another job can still send it', async () => {
  const send = vi.fn(async () => ({ state: 'sent', mode: 'real' } as const));
  registerChannelSender('web', { channel: 'web', mode: 'real', send });
  const { jobId, messageId, conversationId } = await queueDelivery();
  const replacement = await jobs.enqueue('core.deliver', { messageId }, {
    businessId, dedupKey: 'replacement:' + messageId, lockKey: 'conversation:' + conversationId,
  });
  const cancelled = await db.tx(async (tx) => {
    await tx.query("UPDATE jobs SET state='cancelled',finished_at=now() WHERE id=$1 AND business_id=$2", [jobId, businessId]);
    return settleCancelledDelivery(tx, jobId);
  });
  expect(cancelled).toBeNull();
  expect(await deliveryState(messageId)).toMatchObject({ state: 'pending' });
  await drain();
  expect(send).toHaveBeenCalledTimes(1);
  expect(await jobs.get(replacement.jobId)).toMatchObject({ state: 'succeeded' });
  expect(await deliveryState(messageId)).toMatchObject({ state: 'sent' });
}, 20_000);

test('a lost enqueue acknowledgement returns the committed job without downgrading pending or sent', async () => {
  const { jobId, messageId, conversationId } = await queueDelivery();
  const send = vi.fn(async () => ({ state: 'sent', mode: 'real' } as const));
  registerChannelSender('web', { channel: 'web', mode: 'real', send });

  const repeat = async () => {
    const queue = vi.spyOn(jobHandlers, 'enqueueJob').mockRejectedValueOnce(new Error('Synthetic competing acknowledgement error'));
    try { return await sendToCustomer(conversationId, parts, { businessId, messageId }); }
    finally { queue.mockRestore(); }
  };
  expect((await repeat()).jobId).toBe(jobId);
  expect(await deliveryState(messageId)).toMatchObject({ state: 'pending', error: null });
  await drain();
  expect((await repeat()).jobId).toBe(jobId);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await deliveryState(messageId)).toMatchObject({ state: 'sent', error: null });
}, 20_000);

test.each([{ state: 'unknown', error: 'PROVIDER_TIMEOUT' }, { state: 'pending', error: 'inflight:1' }])(
  'a failed enqueue leaves an already ambiguous $state delivery intact', async ({ state, error }) => {
    const { jobId, messageId, conversationId } = await queueDelivery();
    await db.tx(async (tx) => {
      await tx.query("UPDATE jobs SET state='cancelled' WHERE id=$1", [jobId]);
      await tx.query('UPDATE messages SET delivery_state=$2,delivery_error=$3 WHERE id=$1', [messageId, state, error]);
    });
    const queue = vi.spyOn(jobHandlers, 'enqueueJob').mockRejectedValueOnce(new Error('Synthetic retry failure'));
    try {
      await expect(sendToCustomer(conversationId, parts, { businessId, messageId })).rejects.toThrow('Synthetic retry failure');
    } finally { queue.mockRestore(); }
    expect(await deliveryState(messageId)).toMatchObject({ state, error });
  }, 20_000,
);
