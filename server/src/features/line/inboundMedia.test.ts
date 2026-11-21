import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inboundAttachment } from './inboundMedia';
import type { LineConnection } from './repo';

const mocks = vi.hoisted(() => ({ save: vi.fn(), token: vi.fn(), rejected: vi.fn(), mark: vi.fn() }));
vi.mock('../../core', async () => ({
  AppError: (await import('../../core/errors')).AppError,
  config: { LINE_MODE: 'real', UPLOAD_MAX_MB: 1 },
  storage: { save: mocks.save },
}));
vi.mock('./connection', () => ({
  getAccessToken: mocks.token, isRejectedCredential: mocks.rejected, markConnectionError: mocks.mark,
}));

const connection = { id: 'connection', business_id: 'shop' } as LineConnection;
const signal = new AbortController().signal;

describe('LINE inbound attachments', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.token.mockResolvedValue('synthetic-token');
    mocks.save.mockResolvedValue({ id: 'file' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('checks image bytes instead of trusting the provider MIME header', async () => {
    const bytes = await sharp({ create: { width: 5, height: 5, channels: 3, background: '#fff' } }).png().toBuffer();
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    expect(await inboundAttachment({ id: '1234567', type: 'image' }, connection, 'en', signal)).toEqual({
      parts: [{ type: 'image', fileId: 'file', alt: 'Picture from customer' }], triggerAi: true,
    });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      businessId: 'shop', mimeType: 'image/png', originalName: 'line-1234567.png', purpose: 'chat-attachment',
    }));
  });

  it('does not fetch an external content-provider URL', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(await inboundAttachment({ id: '1234567', type: 'image', contentProvider: { type: 'external' } }, connection, 'en', signal)).toEqual({
      parts: [{ type: 'text', text: '[Picture (external link)]' }], triggerAi: true,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it('keeps an oversized upload as a localized placeholder', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('body', { headers: { 'Content-Length': '2000000' } })));
    expect(await inboundAttachment({ id: '1234567', type: 'file' }, connection, 'en', signal)).toEqual({
      parts: [{ type: 'text', text: '[File exceeds the upload limit and was not saved]' }], triggerAi: false,
    });
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
