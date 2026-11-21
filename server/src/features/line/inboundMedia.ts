import sharp from 'sharp';
import type { FilePart } from '@nless/shared/core/types';
import { AppError, config, storage } from '../../core';
import { getAccessToken, isRejectedCredential, markConnectionError } from './connection';
import { lineLabels, type LineLanguage } from './labels';
import { downloadLineContent, imageMimes } from './media';
import type { LineEventMessage, NormalizedMessage } from './normalize';
import type { LineConnection } from './repo';

const messagePattern = /^[0-9]{6,30}$/;
export const lineAttachmentTypes = new Set(['image', 'audio', 'video', 'file']);

function filename(value: string): string {
  return Array.from(value.replace(/[\\/\x00-\x1f\x7f]/g, '').trim()).slice(0, 120).join('');
}
function fallback(text: string, triggerAi = false): NormalizedMessage {
  return { parts: [{ type: 'text', text }], triggerAi };
}

function fileMime(value: string) {
  const supported = /^audio\/[a-z0-9.+-]+$/.test(value) || /^application\/vnd\.[a-z0-9.+-]+$/.test(value) ||
    ['video/mp4', 'application/pdf', 'text/plain', ...imageMimes.values()].includes(value);
  return supported ? value : 'application/octet-stream';
}

export async function inboundAttachment(
  message: LineEventMessage, connection: LineConnection, language: LineLanguage, signal: AbortSignal,
): Promise<NormalizedMessage | null> {
  const labels = lineLabels[language];
  if (!messagePattern.test(message.id)) return null;
  const picture = message.type === 'image';
  const notice = picture ? labels.picture : message.type === 'audio' ? labels.voice : message.type === 'video' ? labels.video : labels.file;
  if (message.contentProvider?.type === 'external') return fallback(picture ? labels.externalPicture : notice, picture);
  if (config.LINE_MODE !== 'real') return fallback(notice);

  let token: string;
  try {
    token = await getAccessToken(connection);
  } catch (error) {
    if (!isRejectedCredential(error)) throw error;
    await markConnectionError(connection, 'token_rejected');
    return fallback(labels.unavailable);
  }
  const result = await downloadLineContent(message.id, token, { signal });
  if (result.kind === 'bad_message_id') return null;
  if (result.kind === 'too_large') return fallback(labels.tooLarge);
  if (result.kind === 'unauthorized') await markConnectionError(connection, 'token_rejected');
  if (result.kind !== 'ok') return fallback(message.type === 'video' || message.type === 'audio' ? notice : labels.unavailable);

  let mimeType: string;
  if (picture) {
    const metadata = await sharp(result.bytes, { limitInputPixels: 64_000_000 }).metadata().catch(() => null);
    mimeType = imageMimes.get(metadata?.format ?? '') ?? 'application/octet-stream';
  } else {
    mimeType = fileMime(result.mimeType);
  }
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'application/octet-stream' ? 'bin' : mimeType.split('/')[1];
  const originalName = filename(message.fileName ?? '') || 'line-' + message.id + '.' + extension;

  try {
    const stored = await storage.save({
      businessId: connection.business_id, uploadedBy: null, purpose: 'chat-attachment',
      originalName, mimeType, bytes: result.bytes,
    });
    if (picture && mimeType.startsWith('image/')) {
      return { parts: [{ type: 'image', fileId: stored.id, alt: labels.pictureAlt }], triggerAi: true };
    }
    const filePart: FilePart = {
      type: 'file', fileId: stored.id, fileName: stored.originalName, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes,
    };
    const includeNotice = picture || message.type === 'audio' || message.type === 'video';
    return { parts: includeNotice ? [filePart, { type: 'text', text: notice }] : [filePart], triggerAi: false };
  } catch (error) {
    if (error instanceof AppError && error.code === 'VALIDATION_ERROR') return fallback(labels.tooLarge);
    throw error;
  }
}
