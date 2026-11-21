import { describe, expect, it, vi } from 'vitest';
import { config, decryptSecret } from '../../core';
import type { DbExecutor } from '../../core';
import { insertSandboxMail } from './mail';

describe('sandbox mail', () => {
  it('writes bilingual outbox content and encrypts the action URL', async () => {
    const one = vi.fn().mockResolvedValue({ id: 'outbox-1' });
    const actionUrl = new URL('/verify-email?token=synthetic-test-value', config.APP_BASE_URL).href;
    const input = {
      to: 'test@example.test', userId: null, template: 'verify_email' as const, locale: 'th' as const,
      vars: { name: 'Test User', minutes: '30' }, actionUrl,
    };

    await expect(insertSandboxMail(input, { one } as unknown as DbExecutor))
      .resolves.toEqual({ outboxId: 'outbox-1', delivery: 'email_sandbox' });
    const [, params] = one.mock.calls[0];
    expect(params.slice(0, 5)).toEqual(['test@example.test', null, 'verify_email', 'th', 'ยืนยันอีเมลสำหรับ Endless']);
    expect(params[5]).toContain('30');
    expect(params[5]).not.toContain(actionUrl);
    expect(params[6]).not.toContain('synthetic-test-value');
    expect(decryptSecret(params[6])).toBe(actionUrl);

    await insertSandboxMail({ ...input, locale: 'en' }, { one } as unknown as DbExecutor);
    expect(one.mock.calls[1][1][4]).toBe('Confirm your email for Endless');
  });

  it('rejects invalid mail and links outside the configured origins before writing', async () => {
    const one = vi.fn();
    await expect(insertSandboxMail({
      to: 'test@example.test', template: 'verify_email', locale: 'en',
      vars: { name: 'Test User', minutes: '30' }, actionUrl: 'https://external.example.test/verify-email',
    }, { one } as unknown as DbExecutor)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(one).not.toHaveBeenCalled();
  });
});
