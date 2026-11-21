import express from 'express';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { expect, test } from 'vitest';
import { mountSpa } from './spa';

test('token-bearing documents suppress referrers even before browser routing starts', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'nless-token-document-'));
  const html = join(dist, 'index.html');
  try {
    await writeFile(html, '<!doctype html><title>Synthetic token document</title>');
    const app = express();
    mountSpa(app, dist);
    const agent = request(app);
    for (const path of ['/invitations/accept', '/invitations/accept/', '/verify-email', '/verify-email/', '/reset-password', '/reset-password/']) {
      const document = await agent.get(path + '?token=synthetic-test-value');
      expect(document.status, path).toBe(200);
      expect(document.headers['content-type'], path).toMatch(/^text\/html/);
      expect(document.headers['referrer-policy'], path).toBe('no-referrer');
    }
    expect((await agent.get('/')).headers['referrer-policy']).toBeUndefined();
    const missingAsset = await agent.get('/assets/removed-chunk.js');
    expect(missingAsset.status).toBe(404);
    expect(missingAsset.headers['content-type']).not.toMatch(/text\/html/);
  } finally {
    await unlink(html).catch(() => {});
    await rmdir(dist);
  }
});
