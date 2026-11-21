import { config } from '../../core';
import type { FeatureApi, RouteContext } from '../../core';
import { demoPoll, getPublicShop, getPublicShopView, publicIdentity, rateDemoPoll, rateDemoSession, sendDemoMessage, testerIdentity } from './demoChat';
import { demoSettings, performDemoAction, readDemoFile, resetDemoConversation, updateDemoSettings } from './demoManage';
import { demoActionBody, demoPollQuery, demoSendBody, demoSessionBody, demoSettingsBody } from './schemas';
import { requireVisitor, visitorSession } from './visitor';

const publicPath = '/public/demo-chat/:slug';
const staffPath = '/businesses/:businessId/demo-chat';
const visitorCookie = 'nless_demo_visitor';
const cookieLength = 30 * 24 * 60 * 60 * 1000;
const staffAuth = { auth: 'business', permission: 'insights.demo' } as const;
const publicAuth = { auth: 'none' } as const;

function requestToken(req: RouteContext['req']): string | undefined {
  const cookie: unknown = req.cookies?.[visitorCookie];
  return typeof cookie === 'string' ? cookie : req.get('X-Demo-Visitor');
}

function requestIp(req: RouteContext['req']): string { return req.ip ?? 'unknown'; }

async function visitor(ctx: RouteContext) {
  return publicIdentity(await getPublicShop(ctx.params.slug), requireVisitor(requestToken(ctx.req)));
}

function staff(ctx: RouteContext) { return testerIdentity(ctx.business!.id, ctx.user!.id); }

export function registerDemoRoutes(api: FeatureApi) {
  api.get(publicPath, { ...publicAuth, summary: 'Read public Demo Chat shop' },
    async (ctx) => getPublicShopView(await getPublicShop(ctx.params.slug)));

  api.post(publicPath + '/session', { ...publicAuth, body: demoSessionBody, summary: 'Create Demo Chat visitor session' },
    async (ctx) => {
      await getPublicShop(ctx.params.slug);
      rateDemoSession(requestIp(ctx.req));
      const visitorToken = visitorSession(ctx.body.visitorToken ?? requestToken(ctx.req));
      ctx.res.cookie(visitorCookie, visitorToken, {
        httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE, path: '/', maxAge: cookieLength,
      });
      return { visitorToken };
    });

  api.get(publicPath + '/poll', { ...publicAuth, query: demoPollQuery, summary: 'Poll visitor conversation' },
    async (ctx) => {
      const identity = await visitor(ctx);
      rateDemoPoll(identity, requestIp(ctx.req));
      return demoPoll(identity, ctx.query.after, ctx.query.waitMs);
    });

  api.post(publicPath + '/messages', { ...publicAuth, body: demoSendBody, summary: 'Save guarded visitor message' },
    async (ctx) => sendDemoMessage(await visitor(ctx), ctx.body.text, ctx.body.clientRequestId, requestIp(ctx.req)));

  api.post(publicPath + '/actions', { ...publicAuth, body: demoActionBody, summary: 'Confirm or cancel visitor proposal' },
    async (ctx) => performDemoAction(await visitor(ctx), ctx.body));

  api.post(publicPath + '/reset', { ...publicAuth, summary: 'Close current visitor conversation' },
    async (ctx) => resetDemoConversation(await visitor(ctx)));

  api.get(publicPath + '/files/:fileId', { ...publicAuth, summary: 'Read a visitor attachment' },
    async (ctx) => readDemoFile(await visitor(ctx), ctx.params.fileId));

  api.get(staffPath + '/settings', { ...staffAuth, summary: 'Read Demo Chat link settings' },
    async (ctx) => demoSettings(ctx.business!.id));

  api.put(staffPath + '/settings', { ...staffAuth, body: demoSettingsBody, summary: 'Update Demo Chat link settings' },
    async (ctx) => updateDemoSettings(ctx.business!.id, ctx.user!.id, ctx.body));

  api.get(staffPath + '/poll', { ...staffAuth, query: demoPollQuery, summary: 'Poll staff test conversation' },
    async (ctx) => {
      const identity = staff(ctx);
      rateDemoPoll(identity, requestIp(ctx.req));
      return demoPoll(identity, ctx.query.after, ctx.query.waitMs);
    });

  api.post(staffPath + '/messages', { ...staffAuth, body: demoSendBody, summary: 'Save staff test message' },
    async (ctx) => sendDemoMessage(staff(ctx), ctx.body.text, ctx.body.clientRequestId));

  api.post(staffPath + '/actions', { ...staffAuth, body: demoActionBody, summary: 'Confirm or cancel staff test proposal' },
    async (ctx) => performDemoAction(staff(ctx), ctx.body));

  api.post(staffPath + '/reset', { ...staffAuth, summary: 'Close current staff test conversation' },
    async (ctx) => resetDemoConversation(staff(ctx)));

  api.get(staffPath + '/files/:fileId', { ...staffAuth, summary: 'Read a staff test attachment' },
    async (ctx) => readDemoFile(staff(ctx), ctx.params.fileId));
}
