import { createHash, timingSafeEqual } from 'node:crypto';
import type { Application, RequestHandler } from 'express';
import { z } from 'zod';
import { SEED } from '@nless/shared/core/fixtures';
import { getConversation, getHistory, saveMessage } from '../features/inbox/service';
import { assignConversation } from '../features/team/service';
import { createSession, getBusiness, listBusinesses, requirePermission } from './auth';
import { config } from './config';
import { db } from './db';
import { AppError } from './errors';
import { reply } from './http';
import { log } from './log';
import { rateLimited } from './ratelimit';

const production = config.NODE_ENV === 'production';
const email = z.email().transform((value) => value.toLowerCase());
const id = z.uuid();

export function mountDev(app: Application): void {
  if (!config.DEV_LOGIN || !config.DEV_LOGIN_ENABLED) return;
  if (production && config.DEV_LOGIN_TOKEN.length < 24) {
    log.error('Production dev login requires DEV_LOGIN_TOKEN');
    return;
  }
  const tokenRequired = production || Boolean(config.DEV_LOGIN_TOKEN);
  const digest = (text: string) => createHash('sha256').update(text).digest();
  const tokenHash = digest(config.DEV_LOGIN_TOKEN);
  const token: RequestHandler = (req, res, next) => {
    res.setHeader('X-Dev-Login', '1');
    if (tokenRequired && !timingSafeEqual(tokenHash, digest(req.get('X-Dev-Login-Token') ?? ''))) {
      return next(new AppError('NOT_FOUND', 'Route not found'));
    }
    next();
  };
  app.get('/api/dev/status', (_req, res) => {
    res.setHeader('X-Dev-Login', '1');
    reply(res, { enabled: true, tokenRequired });
  });
  app.get('/api/dev/users', token, async (_req, res) => {
    const users = await Promise.all(SEED.users.map(async ({ id, email, displayName, isPlatformAdmin }) => ({
      email, displayName, isPlatformAdmin, businesses: await listBusinesses(id),
    })));
    reply(res, users);
  });
  app.post('/api/dev/login', token, rateLimited({ name: 'dev.login', limit: 10, windowSeconds: 60 }), async (req, res) => {
    const address = email.parse(req.body?.email);
    const fixture = SEED.users.find((user) => user.email === address);
    const seeded = fixture && await db.maybeOne("SELECT id FROM users WHERE id=$1 AND email_normalized=$2 AND status='active'", [fixture.id, address]);
    if (!fixture || !seeded) throw new AppError('NOT_FOUND', 'Seed user not found');
    await createSession(fixture.id, 'dev', res);
    reply(res, { ok: true });
  });
  app.post('/api/dev/simulate-inbound', token, async (req, res) => {
    const data = z.object({ businessId: id, text: z.string().trim().min(1).max(8000), customerExternalId: z.string().max(250).optional() }).parse(req.body);
    await getBusiness(req, data.businessId);
    const result = await saveMessage({
      businessId: data.businessId, customer: { channel: 'web', externalId: data.customerExternalId ?? 'dev-demo-visitor', displayName: 'Demo visitor' },
      direction: 'inbound', author: 'customer', parts: [{ type: 'text', text: data.text }], origin: 'demo',
    });
    reply(res, result);
  });
  app.get('/api/dev/conversations/:conversationId/messages', token, async (req, res) => {
    const conversationId = id.parse(req.params.conversationId);
    const conversation = await getConversation(conversationId);
    if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found');
    await getBusiness(req, conversation.businessId);
    reply(res, await getHistory(conversation.id, { businessId: conversation.businessId }));
  });
  app.post('/api/dev/conversations/:conversationId/assign', token, async (req, res) => {
    const conversationId = id.parse(req.params.conversationId);
    const userEmail = email.nullable().parse(req.body?.userEmail);
    const conversation = await getConversation(conversationId);
    if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found');
    const scope = await getBusiness(req, conversation.businessId);
    requirePermission(scope.scope, 'chat.takeover');
    const fixture = userEmail === null ? null : SEED.users.find((user) => user.email === userEmail);
    if (userEmail && !fixture) throw new AppError('NOT_FOUND', 'Seed user not found');
    const assigned = await assignConversation(conversationId, fixture?.id ?? null, { businessId: conversation.businessId, actorUserId: scope.user.id });
    reply(res, { ok: true, ...assigned });
  });
}
