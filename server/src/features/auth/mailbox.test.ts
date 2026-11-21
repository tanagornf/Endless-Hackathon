import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config, db, encryptSecret } from '../../core';
import { listMailbox } from './mailbox';

vi.mock('../../core', async (original) => {
  const core = await original<typeof import('../../core')>();
  return { ...core, db: { query: vi.fn() } };
});

describe('sandbox mailbox scope', () => {
  beforeEach(() => vi.mocked(db.query).mockReset());

  it('rejects a non-admin all-mailboxes request before querying', async () => {
    await expect(listMailbox({ email: 'reader@example.test', isPlatformAdmin: false }, 'all'))
      .rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('queries only the caller’s normalized address and decrypts an authorized result', async () => {
    const actionUrl = new URL('/reset-password?token=synthetic-proof', config.APP_BASE_URL).href;
    vi.mocked(db.query).mockResolvedValue({ rows: [{
      id: 'outbox-1', to_email: 'reader@example.test', template: 'reset_password', subject: 'Reset',
      body_text: 'Open the link', action_url_enc: encryptSecret(actionUrl),
      created_at: new Date('2026-11-21T00:00:00Z'), expires_at: new Date('2026-11-22T00:00:00Z'),
    }], rowCount: 1 });
    const result = await listMailbox({ email: ' READER@EXAMPLE.TEST ', isPlatformAdmin: false }, 'mine');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('to_email_normalized = $1'), ['reader@example.test']);
    expect(result).toEqual({ scope: 'mine', items: [expect.objectContaining({
      to: 'reader@example.test', mode: 'sandbox', actionUrl, template: 'reset_password',
    })] });
  });

  it('keeps the mailbox scope explicit for admins', async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(listMailbox({ email: 'admin@example.test', isPlatformAdmin: true }, 'all'))
      .resolves.toEqual({ scope: 'all', items: [] });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT 100'), []);
  });
});
