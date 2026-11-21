import express from 'express';
import type { Application } from 'express';
import { join } from 'node:path';
import { AppError } from './errors';

export function mountSpa(app: Application, dist: string): void {
  app.get(['/invitations/accept', '/verify-email', '/reset-password'], (_req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(express.static(dist, { index: false }));
  app.use('/assets', (_req, res) => { res.set('Cache-Control', 'no-store').sendStatus(404); });
  app.get('/{*splat}', (req, res, next) => {
    if (/^\/(?:health|healthz|readyz|build-info|ws)(?:\/|$)/.test(req.path)) return next(new AppError('NOT_FOUND', 'Route not found'));
    res.sendFile(join(dist, 'index.html'));
  });
}
