import { createHash } from 'node:crypto';
import request from 'supertest';
import { expect, test } from 'vitest';
import { createHttpApp } from './http';

test('delivers the full LINE request bytes before JSON parsing', async () => {
  const { app, api } = createHttpApp();
  const payload = '{"text":"' + 'a'.repeat(999989) + '"}';
  const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
  api('F17').webhook('POST', '/line/:channelId', async (ctx) => ({
    status: 200,
    body: { size: ctx.rawBody.byteLength, hash: digest(ctx.rawBody), id: ctx.params.channelId },
  }));
  const response = await request(app).post('/webhooks/line/demo').type('application/json').send(payload);
  expect(response.body).toEqual({ size: 1_000_000, hash: digest(Buffer.from(payload)), id: 'demo' });
});

test('lets webhook handlers reject malformed JSON before parsing it', async () => {
  const { app, api } = createHttpApp();
  api('F17').webhook('POST', '/line/:channelId', async () => ({ status: 401 }));
  const response = await request(app).post('/webhooks/line/demo').type('application/json').send('{ invalid');
  expect(response.status).toBe(401);
});
