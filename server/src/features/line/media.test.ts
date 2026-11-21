import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadLineContent, readChannelMedia, signedMediaUrl } from './media';

const fixtures = vi.hoisted(() => ({ file: vi.fn(), read: vi.fn(), limit: vi.fn() }));
vi.mock('../../core', async () => ({
  AppError: (await import('../../core/errors')).AppError,
  config: { PUBLIC_BASE_URL: 'https://endless.test', SESSION_SECRET: 'synthetic-signing-secret', UPLOAD_MAX_MB: 20 },
  db: { maybeOne: fixtures.file },
  storage: { read: fixtures.read },
  assertRateLimit: fixtures.limit,
}));

const fileId = '11111111-1111-4111-8111-111111111111';
const variant = 'square';

describe('LINE media', () => {
  beforeEach(() => vi.resetAllMocks());

  it('authenticates a signed image URL before reading tenant-scoped storage', async () => {
    const bytes = await sharp({ create: { width: 50, height: 20, channels: 3, background: '#fff' } }).png().toBuffer();
    fixtures.file.mockResolvedValue({ business_id: 'shop' });
    fixtures.read.mockResolvedValue({ file: { mimeType: 'image/png', originalName: 'fixture.png' }, bytes });
    const signed = new URL(signedMediaUrl(fileId, { variant, ttlSeconds: 3600 }));
    const result = await readChannelMedia(fileId, Object.fromEntries(signed.searchParams));
    expect(signed.pathname).toBe('/api/v1/channel-media/' + fileId);
    expect(fixtures.read).toHaveBeenCalledWith(fileId, { businessId: 'shop' });
    expect(result).toMatchObject({ kind: 'file', mimeType: 'image/jpeg', inline: true });
    expect(await sharp(result.bytes).metadata()).toMatchObject({ width: 800, height: 800 });
  });

  it('treats wrong signatures, expired URLs, and invalid variants as not found', async () => {
    const expired = new URL(signedMediaUrl(fileId, { variant, ttlSeconds: 1 }));
    const query = Object.fromEntries(expired.searchParams);
    for (const invalid of [{ ...query, sig: 'invalid' }, { ...query, exp: '1' }, { ...query, v: 'random' }]) {
      await expect(readChannelMedia(fileId, invalid)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
    expect(fixtures.file).not.toHaveBeenCalled();
  });

  it('does not return bytes when tenant-scoped storage returns no file', async () => {
    fixtures.file.mockResolvedValue({ business_id: 'shop' });
    fixtures.read.mockResolvedValue(null);
    const url = new URL(signedMediaUrl(fileId, { variant: 'original', ttlSeconds: 3600 }));
    await expect(readChannelMedia(fileId, Object.fromEntries(url.searchParams))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('downloads only validated LINE message IDs from the media host, with redirects disabled', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('sample', {
      headers: { 'Content-Type': 'text/plain' },
    }));
    await expect(downloadLineContent('https://other.test', 'synthetic-token', { fetcher })).resolves.toEqual({ kind: 'bad_message_id' });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(downloadLineContent('123456', 'synthetic-token', { fetcher })).resolves.toMatchObject({ kind: 'ok', mimeType: 'text/plain' });
    expect(fetcher).toHaveBeenCalledWith('https://api-data.line.me/v2/bot/message/123456/content', expect.objectContaining({
      redirect: 'manual', headers: { Authorization: 'Bearer synthetic-token' },
    }));
    fetcher.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://other.test' } }));
    await expect(downloadLineContent('123456', 'synthetic-token', { fetcher })).resolves.toEqual({ kind: 'unavailable' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('bounds both Content-Length and streamed bodies and retries content that is not ready', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('short', { headers: { 'Content-Length': '30' } }))
      .mockResolvedValueOnce(new Response('too big'))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const options = { maxBytes: 5, fetcher };
    await expect(downloadLineContent('123456', 'synthetic-token', options)).resolves.toEqual({ kind: 'too_large' });
    await expect(downloadLineContent('123456', 'synthetic-token', options)).resolves.toEqual({ kind: 'too_large' });
    await expect(downloadLineContent('123456', 'synthetic-token', options)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: true });
  });
});
