import { z } from 'zod';
import { config, db, defineFeatureRoutes, registerChannelSender } from '../../core';
import { bootstrapLineConnection, ConnectBody } from './connection';
import { LINE_EVENT_JOB } from './config';
import { lineEventJob } from './events';
import { makeLineSender } from './sender';
import { connect, disconnect, getConnectionView, listEvents, readChannelMedia, verify } from './service';
import { handleLineWebhook } from './webhook';

const path = '/businesses/:businessId/channels/line';
const EventsQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });
const manage = { auth: 'business', permission: 'business.channels' } as const;

let lastCleanupAt: number | null = null;
async function maintainLine() {
  await bootstrapLineConnection();
  if (lastCleanupAt !== null && Date.now() - lastCleanupAt < 86_400_000) return;
  await db.query("DELETE FROM line_events WHERE received_at < now() - interval '14 days'");
  await db.query("DELETE FROM line_reply_tokens_used WHERE used_at < now() - interval '1 day'");
  await db.query("DELETE FROM line_actions WHERE expires_at < now() - interval '2 days'");
  lastCleanupAt = Date.now();
}

export default defineFeatureRoutes({
  featureId: 'F17',
  slug: 'line',
  async register(api) {
    api.webhook('POST', '/line/:channelId', handleLineWebhook);
    api.get('/channel-media/:fileId', { auth: 'none', summary: 'Read signed channel media' },
      async (ctx) => readChannelMedia(ctx.params.fileId, ctx.query));
    api.get(path, { auth: 'business', permission: 'business.read', summary: 'Read LINE channel connection' },
      async (ctx) => getConnectionView(ctx.business!.id));
    api.post(path + '/connect', { ...manage, body: ConnectBody, summary: 'Connect LINE Official Account' },
      async (ctx) => connect(ctx.business!.id, ctx.user!.id, ctx.body));
    api.post(path + '/verify', { ...manage, summary: 'Verify LINE Official Account' },
      async (ctx) => verify(ctx.business!.id, ctx.user!.id));
    api.delete(path, { ...manage, summary: 'Disconnect LINE Official Account' }, async (ctx) => {
      await disconnect(ctx.business!.id, ctx.user!.id);
      return { kind: 'no_content' };
    });
    api.get(path + '/events', { ...manage, query: EventsQuery, summary: 'List recent LINE events' },
      async (ctx) => listEvents(ctx.business!.id, ctx.query.limit));

    if (config.LINE_MODE === 'real') {
      registerChannelSender('line', makeLineSender());
      await bootstrapLineConnection();
    }
  },
  jobs: { [LINE_EVENT_JOB]: lineEventJob },
  schedules: [{ name: 'line.maintenance', everySeconds: 600, handler: maintainLine }],
});
