import type { Request } from 'express';
import { AppError, config } from '../../core';

type RequestHeaders = Pick<Request, 'get'>;

export function assertSameOriginRequest(req: RequestHeaders): void {
  const origin = req.get('origin');
  const origins = [config.APP_BASE_URL, config.PUBLIC_BASE_URL, config.WEB_ORIGIN]
    .flatMap((url) => url ? [new URL(url).origin] : []);
  if (req.get('x-requested-with') !== 'nless' || (origin !== undefined && !origins.includes(origin))) {
    throw new AppError('PERMISSION_DENIED', 'Request failed origin validation', { details: { reason: 'csrf' } });
  }
}
