import express from 'express';
import { join } from 'node:path';
import { FEATURES } from '@nless/shared/core/features';
import { SetFeatureFlagBody } from '@nless/shared/core/flags';
import { destroySession, listBusinesses } from './auth';
import { config, rootDir } from './config';
import { mountDev } from './dev';
import { AppError } from './errors';
import { featureFlags, initializeFlags, loadFeatures, setFeatureFlag } from './features';
import { createHttpApp, httpError } from './http';
import { mountMeta } from './meta';

export async function createApp() {
  const http = createHttpApp();
  const { app, routes } = http;
  const api = http.api('F01');
  api.get('/me', { auth: 'user' }, async ({ user }) => ({ user, businesses: await listBusinesses(user!.id) }));
  api.get('/businesses/:businessId', { auth: 'business' }, async ({ business }) => business);
  api.post('/session/logout', { auth: 'user' }, async ({ req, res }) => {
    await destroySession(req, res);
    return { ok: true };
  });
  api.get('/features', { auth: 'user' }, async () => ({ production: config.NODE_ENV === 'production', items: await featureFlags(routes) }));
  api.put('/ops/features/:featureId', { auth: 'platform_admin', body: SetFeatureFlagBody }, async ({ body, params, user }) => {
    await setFeatureFlag(user!.id, params.featureId, body.hidden, body.reason);
    return (await featureFlags(routes)).find((feature) => feature.featureId === params.featureId);
  });
  api.get('/_meta/features', { auth: 'user' }, async () => FEATURES.map((feature) => ({ ...feature, loaded: loaded.has(feature.id) })));
  api.get('/_meta/routes', { auth: 'user' }, async () => routes);
  mountDev(app);
  const loaded = await loadFeatures(http);
  await initializeFlags();
  mountMeta(app, () => loaded.size);
  app.use(['/api', '/webhooks', '/mcp'], (_req, _res, next) => next(new AppError('NOT_FOUND', 'Route not found')));
  if (config.NODE_ENV === 'production') {
    const dist = join(rootDir, 'web', 'dist');
    app.use(express.static(dist, { index: false }));
    app.get('/{*splat}', (req, res, next) => {
      if (/^\/(?:health|healthz|readyz|build-info|ws)(?:\/|$)/.test(req.path)) return next(new AppError('NOT_FOUND', 'Route not found'));
      res.sendFile(join(dist, 'index.html'));
    });
  }
  app.use(httpError);
  return app;
}
