import { createHmac, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { AppError, assertRateLimit, config, db, storage, type HttpResponse } from '../../core';

const LINE_DATA_API = 'https://api-data.line.me';
const filePattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const validMediaFileId = (value: string) => filePattern.test(value);
const messagePattern = /^[0-9]{6,30}$/;
const variants = z.enum(['original', 'preview', 'square']);
type MediaVariant = z.infer<typeof variants>;
const SignedQuery = z.object({
  v: variants,
  exp: z.string().regex(/^[0-9]{1,12}$/),
  sig: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
const maxImageBytes = 9 * 1024 * 1024;
const maxPixels = 64_000_000;

export const imageMimes = new Map([
  ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['gif', 'image/gif'], ['webp', 'image/webp'],
]);

function mediaSignature(fileId: string, variant: MediaVariant, expiration: string) {
  return createHmac('sha256', config.SESSION_SECRET).update([fileId, variant, expiration].join('.')).digest();
}

export function signedMediaUrl(fileId: string, options: { variant: MediaVariant; ttlSeconds: number }, issuedAtMs = Date.now()): string {
  if (!validMediaFileId(fileId)) throw new AppError('NOT_FOUND');
  if (!variants.safeParse(options.variant).success || !Number.isSafeInteger(options.ttlSeconds) ||
      options.ttlSeconds < 1 || options.ttlSeconds > 604_800) throw new AppError('VALIDATION_ERROR', 'Invalid LINE media lifetime or variant');
  const base = config.PUBLIC_BASE_URL;
  if (!base || new URL(base).protocol !== 'https:') throw new AppError('PROVIDER_UNAVAILABLE', 'public_url_not_https');

  const url = new URL('/api/v1/channel-media/' + fileId, base);
  const exp = String(Math.floor(issuedAtMs / 1_000) + options.ttlSeconds);
  url.search = new URLSearchParams({
    exp, v: options.variant, sig: mediaSignature(fileId, options.variant, exp).toString('base64url'),
  }).toString();
  return url.toString();
}

type FileResponse = Extract<HttpResponse<never>, { kind: 'file' }>;
export async function readChannelMedia(fileId: string, query: unknown): Promise<FileResponse> {
  const parsed = SignedQuery.safeParse(query);
  if (!validMediaFileId(fileId) || !parsed.success || Number(parsed.data.exp) <= Date.now() / 1_000) throw new AppError('NOT_FOUND');
  const { v, exp, sig } = parsed.data;
  const expected = mediaSignature(fileId, v, exp);
  const received = Buffer.from(sig, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) throw new AppError('NOT_FOUND');

  assertRateLimit({ key: 'channel-media:' + fileId, limit: 60, windowSeconds: 60 });
  const owner = await db.maybeOne<{ business_id: string }>(
    "SELECT f.business_id FROM files f JOIN businesses b ON b.id = f.business_id WHERE f.id = $1 AND b.status = 'active'", [fileId],
  );
  if (!owner) throw new AppError('NOT_FOUND');
  const asset = await storage.read(fileId, { businessId: owner.business_id });
  if (!asset) throw new AppError('NOT_FOUND');
  if (!asset.file.mimeType.startsWith('image/')) {
    if (v !== 'original') throw new AppError('NOT_FOUND');
    return { kind: 'file', bytes: asset.bytes, mimeType: 'application/octet-stream', fileName: asset.file.originalName, inline: false };
  }

  try {
    const input = sharp(asset.bytes, { limitInputPixels: maxPixels });
    const { format, width = 0, height = 0, orientation } = await input.metadata();
    if (!format || !imageMimes.has(format) || !width || !height) throw new Error('Unsupported image');
    if (v === 'original' && (format === 'jpeg' || format === 'png') && (!orientation || orientation === 1) &&
        Math.max(width, height) <= 4_096 && asset.bytes.byteLength <= maxImageBytes) {
      return { kind: 'file', bytes: asset.bytes, mimeType: imageMimes.get(format)!, inline: true };
    }

    const resize = v === 'square'
      ? { width: 800, height: 800, fit: 'contain' as const, background: '#fff' }
      : { width: v === 'preview' ? 240 : 4_096, height: v === 'preview' ? 240 : 4_096, fit: 'inside' as const, withoutEnlargement: true };
    let bytes = await input.clone().rotate().resize(resize).flatten({ background: '#fff' }).jpeg({ quality: v === 'original' ? 85 : 80 }).toBuffer();
    if (v === 'original' && bytes.byteLength > maxImageBytes) {
      bytes = await input.clone().rotate().resize({ width: 3_000, height: 3_000, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#fff' }).jpeg({ quality: 70 }).toBuffer();
    }
    if (bytes.byteLength > (v === 'preview' ? 1_000_000 : maxImageBytes)) throw new Error('Resized image is too large');
    return { kind: 'file', bytes, mimeType: 'image/jpeg', inline: true };
  } catch {
    throw new AppError('NOT_FOUND');
  }
}

type DownloadedContent =
  | { kind: 'ok'; bytes: Uint8Array; mimeType: string }
  | { kind: 'too_large' | 'unauthorized' | 'unavailable' | 'bad_message_id' };

interface DownloadOptions {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  maxBytes?: number;
}

export async function downloadLineContent(messageId: string, token: string, options: DownloadOptions = {}): Promise<DownloadedContent> {
  if (!messagePattern.test(messageId)) return { kind: 'bad_message_id' };
  const fetcher = options.fetcher ?? globalThis.fetch;
  const maxBytes = options.maxBytes ?? config.UPLOAD_MAX_MB * 1024 * 1024;
  const timeout = AbortSignal.timeout(15_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  try {
    const reply = await fetcher(LINE_DATA_API + '/v2/bot/message/' + encodeURIComponent(messageId) + '/content', {
      method: 'GET', headers: { Authorization: 'Bearer ' + token }, redirect: 'manual', signal,
    });
    if (!reply.ok || !reply.body) {
      await reply.body?.cancel().catch(() => {});
      if ([404, 409, 429].includes(reply.status) || reply.status >= 500) throw new Error('LINE content is not available yet');
      return { kind: reply.status === 401 || reply.status === 403 ? 'unauthorized' : 'unavailable' };
    }
    if (Number(reply.headers.get('content-length')) > maxBytes) {
      await reply.body.cancel().catch(() => {});
      return { kind: 'too_large' };
    }

    const reader = reply.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        length += chunk.value.byteLength;
        if (length > maxBytes) {
          await reader.cancel().catch(() => {});
          return { kind: 'too_large' };
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    if (!length) return { kind: 'unavailable' };
    const mimeType = reply.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? 'application/octet-stream';
    return { kind: 'ok', bytes: Buffer.concat(chunks, length), mimeType };
  } catch {
    throw new AppError('PROVIDER_UNAVAILABLE', 'LINE message content is temporarily unavailable', { retryable: true });
  }
}
