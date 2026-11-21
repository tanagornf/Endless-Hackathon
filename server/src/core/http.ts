import { randomUUID } from 'node:crypto';
import express from 'express';
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { ZodError } from 'zod';
import type { FeatureId } from '@nless/shared/core/features';
import { getBusiness, getUser, requirePermission, requirePlatformAdmin, SESSION_COOKIE } from './auth';
import { config } from './config';
import { AppError, apiMeta, toApiFailure } from './errors';
import { log, requestContext } from './log';
import type { FeatureApi, HttpResponse, RouteContext, RouteHandler, RouteOptions } from './types';

interface RegisteredRoute {
  featureId: FeatureId;
  method: string;
  path: string;
  auth: RouteOptions['auth'];
  permission?: RouteOptions['permission'];
  summary?: string;
}

const protectCsrf: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.cookies?.[SESSION_COOKIE]) return next();
  const origin = req.get('origin');
  const allowed = [config.WEB_ORIGIN, config.APP_BASE_URL, config.PUBLIC_BASE_URL]
    .filter(Boolean).map((url) => new URL(url!).origin);
  if (req.get('x-requested-with') !== 'nless' || (origin && !allowed.includes(origin))) {
    return next(new AppError('PERMISSION_DENIED', 'Request origin is not allowed'));
  }
  next();
};

export const requestId = () => requestContext.getStore()?.requestId ?? '';
export function reply(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ data, meta: apiMeta(requestId()) });
}
const paramsOf = (req: Request): Record<string, string> => Object.fromEntries(
  Object.entries(req.params).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
);

function httpResponse(res: Response, result: HttpResponse<unknown>): boolean {
  switch (result.kind) {
    case 'json':
      reply(res, result.data, result.status);
      return true;
    case 'no_content':
      res.sendStatus(204);
      return true;
    case 'redirect':
      res.redirect(result.location);
      return true;
    case 'file':
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', (result.inline ? 'inline' : 'attachment') + (result.fileName
        ? "; filename*=UTF-8''" + encodeURIComponent(result.fileName).replace(/'/g, '%27') : ''));
      res.send(Buffer.from(result.bytes));
      return true;
    default:
      return false;
  }
}

export const httpError: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  let error: unknown = err;
  if (err instanceof ZodError) {
    error = new AppError('VALIDATION_ERROR', 'Invalid request', {
      details: { issues: err.issues.map(({ code, path, message }) => ({ code, path, message })) },
    });
  } else if (err instanceof multer.MulterError || err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    error = new AppError('VALIDATION_ERROR', 'Invalid request body');
  }
  const status = error instanceof AppError ? error.status : 500;
  if (status >= 500) log.error({ status, code: error instanceof AppError ? error.code : 'INTERNAL' }, 'Request failed');
  const retryAfter = error instanceof AppError && error.details?.retryAfterSeconds;
  if (typeof retryAfter === 'number') res.setHeader('Retry-After', retryAfter);
  res.status(status).json(toApiFailure(error, requestId()));
};

export function createHttpApp() {
  const app = express();
  const routes: RegisteredRoute[] = [];
  const registry = new Map<string, FeatureId>();
  const apiRouter = express.Router();
  const webhookRouter = express.Router();
  if (config.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const supplied = req.get('x-request-id');
    const id = supplied && /^[a-z\d-]{1,64}$/i.test(supplied) ? supplied : randomUUID();
    const trace = { requestId: id };
    const started = performance.now();
    res.setHeader('X-Request-Id', id);
    res.on('finish', () => {
      const ms = Math.round(performance.now() - started);
      const level = res.statusCode >= 500 || ms >= 1000 ? 'warn' : 'info';
      log[level]({ ...trace, method: req.method, route: req.route?.path, status: res.statusCode, ms }, 'HTTP request');
    });
    requestContext.run(trace, next);
  });
  app.use('/webhooks', express.raw({ type: () => true, limit: '2mb', inflate: false }), webhookRouter, httpError);
  app.use('/api', cookieParser(), express.json({ limit: '2mb' }), protectCsrf);
  app.use('/api/v1', apiRouter);

  function record(entry: RegisteredRoute) {
    const key = entry.method + ' ' + entry.path;
    const existing = registry.get(key);
    if (existing) throw new Error('Duplicate route ' + key + ' in ' + existing + ' and ' + entry.featureId);
    registry.set(key, entry.featureId);
    routes.push(entry);
  }
  function api(featureId: FeatureId): FeatureApi {
    const register = <B, Q, R>(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, opts: RouteOptions<B, Q>, handler: RouteHandler<B, Q, R>) => {
      if (opts.auth === 'business' && !path.includes(':businessId')) throw new Error('Business route requires :businessId');
      record({ featureId, method: method.toUpperCase(), path: '/api/v1' + path, auth: opts.auth, permission: opts.permission, summary: opts.summary });
      const builders: RequestHandler[] = [];
      const upload = opts.upload;
      if (upload) {
        builders.push(multer({
          storage: multer.memoryStorage(),
          limits: { files: upload.maxFiles ?? 1, fileSize: (upload.maxMb ?? config.UPLOAD_MAX_MB) * 1024 * 1024 },
          fileFilter(_req, file, callback) {
            if (upload.accept && !upload.accept.includes(file.mimetype)) {
              callback(new AppError('VALIDATION_ERROR', 'Unsupported content type'));
            } else callback(null, true);
          },
        }).array(upload.field, upload.maxFiles ?? 1));
      }
      apiRouter[method](path, ...builders, async (req, res) => {
        const ctx: RouteContext<B, Q> = {
          req, res, requestId: requestId(), params: paramsOf(req), body: undefined as B, query: undefined as Q,
          files: [], user: null, business: null, scope: null,
          async requireBusiness(businessId, permission) {
            const result = await getBusiness(req, businessId);
            if (permission) requirePermission(result.scope, permission);
            ctx.user = result.user;
            ctx.business = result.business;
            ctx.scope = result.scope;
            return result;
          },
        };
        if (opts.auth === 'business') await ctx.requireBusiness(ctx.params.businessId, opts.permission);
        else if (opts.auth !== 'none') {
          ctx.user = await getUser(req);
          if (opts.auth === 'platform_admin') requirePlatformAdmin(ctx.user);
        }
        ctx.body = opts.body ? opts.body.parse(req.body) : req.body as B;
        ctx.query = opts.query ? opts.query.parse(req.query) : req.query as Q;
        ctx.files = Array.isArray(req.files) ? req.files.map((file) => ({
          fieldName: file.fieldname, originalName: file.originalname, mimeType: file.mimetype,
          size: file.size, bytes: file.buffer,
        })) : [];
        const result = await handler(ctx);
        if (!(result && typeof result === 'object' && 'kind' in result && httpResponse(res, result as HttpResponse<R>))) reply(res, result);
      });
    };
    return {
      get: (...args) => register('get', ...args),
      post: (...args) => register('post', ...args),
      put: (...args) => register('put', ...args),
      patch: (...args) => register('patch', ...args),
      delete: (...args) => register('delete', ...args),
      webhook(method, path, handler) {
        record({ featureId, method, path: '/webhooks' + path, auth: 'none' });
        webhookRouter[method === 'GET' ? 'get' : 'post'](path, async (req, res) => {
          const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
          const text = rawBody.toString('utf8');
          const result = await handler({
            rawBody, text, headers: req.headers, params: paramsOf(req), query: req.query, requestId: requestId(),
            get json() {
              try {
                return text ? JSON.parse(text) as unknown : null;
              } catch {
                throw new AppError('VALIDATION_ERROR', 'Invalid webhook JSON');
              }
            },
          });
          if (result.contentType) res.type(result.contentType);
          res.status(result.status);
          if (result.body === undefined) res.end();
          else res.send(result.body);
        });
      },
    };
  }

  return { app, api, routes };
}
