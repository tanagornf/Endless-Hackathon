import { ERROR_HTTP_STATUS } from '@nless/shared/core/types';
import type { ApiFailure, ApiMeta, ErrorCode } from '@nless/shared/core/types';

export class AppError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(readonly code: ErrorCode, message: string = code, opts?: {
    retryable?: boolean;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(message, { cause: opts?.cause });
    this.name = 'AppError';
    this.status = ERROR_HTTP_STATUS[code];
    this.retryable = opts?.retryable ?? false;
    this.details = opts?.details;
  }
}

export function apiMeta(requestId: string): ApiMeta {
  return { requestId, schemaVersion: 1, serverTime: new Date().toISOString() };
}

export function toApiFailure(error: unknown, requestId: string): ApiFailure {
  const appError = error instanceof AppError ? error : new AppError('INTERNAL', 'Unexpected server error');
  return {
    error: { code: appError.code, message: appError.message, retryable: appError.retryable, details: appError.details },
    meta: apiMeta(requestId),
  };
}
