import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { config } from '../../core';
import { assertSameOriginRequest } from './csrf';

function headers(values: Record<string, string>) {
  return { get: (key: string) => values[key.toLowerCase()] } as Pick<Request, 'get'>;
}

describe('auth request origin', () => {
  it('requires the application header even without a session', () => {
    expect(() => assertSameOriginRequest(headers({}))).toThrow(expect.objectContaining({
      code: 'PERMISSION_DENIED', details: { reason: 'csrf' },
    }));
  });

  it('allows requests without Origin and from the configured origin', () => {
    expect(() => assertSameOriginRequest(headers({ 'x-requested-with': 'nless' }))).not.toThrow();
    expect(() => assertSameOriginRequest(headers({
      'x-requested-with': 'nless', origin: new URL(config.APP_BASE_URL).origin,
    }))).not.toThrow();
  });

  it('rejects unrecognized and opaque origins', () => {
    for (const origin of ['https://somewhere.example.test', 'null']) {
      expect(() => assertSameOriginRequest(headers({ 'x-requested-with': 'nless', origin }))).toThrow();
    }
  });
});
