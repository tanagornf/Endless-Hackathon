import express from 'express';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { expect, test } from 'vitest';
import { mountSpa } from './spa';

test('the initial invitation document suppresses referrers even before browser routing starts', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'nless-invitation-'));
  const html = join(dist, 'index.html');
  try {
    await writeFile(html, '<!doctype html><title>Synthetic invitation</title>');
    const app = express();
    mountSpa(app, dist);
    const agent = request(app);
    const invitation = await agent.get('/invitations/accept?token=synthetic-test-value');
    expect(invitation.status).toBe(200);
    expect(invitation.headers['content-type']).toMatch(/^text\/html/);
    expect(invitation.headers['referrer-policy']).toBe('no-referrer');
    expect((await agent.get('/')).headers['referrer-policy']).toBeUndefined();
  } finally {
    await unlink(html).catch(() => {});
    await rmdir(dist);
  }
});
