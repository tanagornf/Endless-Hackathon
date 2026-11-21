import type { MessagePart } from '@nless/shared/core/types';
import { config, db, type OutboundDelivery } from '../../core';
import { getCustomerLanguage } from '../inbox/service';
import { mintLineAction } from './actionTokens';
import { formatLineFlexDelivery, type LineFlexMessage, type LineQuickReply } from './flex';
import { TEXT_CHUNK } from './config';
import { lineLabels, type LineLanguage } from './labels';
import { signedMediaUrl, validMediaFileId } from './media';

export interface LineText {
  type: 'text';
  text: string;
}
export interface LineImage {
  type: 'image';
  originalContentUrl: string;
  previewImageUrl: string;
}
type PlainLineMessage = LineText | LineImage;
export type LineMessage = (PlainLineMessage | LineFlexMessage) & { quickReply?: LineQuickReply };

export function splitLineText(text: string): string[] {
  const input = text.trim();
  const chunks: string[] = [];
  for (let start = 0; start < input.length;) {
    let end = Math.min(start + TEXT_CHUNK, input.length);
    if (end < input.length) {
      if (/[\uD800-\uDBFF]/.test(input[end - 1]) && /[\uDC00-\uDFFF]/.test(input[end])) end--;
      const tailStart = start + Math.floor(TEXT_CHUNK / 2);
      const tail = input.slice(tailStart, end);
      const paragraph = tail.lastIndexOf('\n\n');
      const line = tail.lastIndexOf('\n');
      const space = tail.lastIndexOf(' ');
      if (paragraph >= 0) end = tailStart + paragraph + 2;
      else if (line >= 0) end = tailStart + line + 1;
      else if (space >= 0) end = tailStart + space + 1;
    }
    const text = input.slice(start, end).trim();
    if (text) chunks.push(text);
    start = end;
  }
  return chunks;
}

function asText(text: string): LineText[] {
  return splitLineText(text).map((chunk) => ({ type: 'text', text: chunk }));
}

async function loadUpload(delivery: OutboundDelivery, fileId: string, kind: 'file' | 'image') {
  if (!validMediaFileId(fileId)) return null;
  return db.maybeOne<{ original_name: string; created_at: Date }>(
    "SELECT f.original_name, m.created_at FROM files f JOIN messages m ON m.id = $4 AND m.business_id = f.business_id AND m.conversation_id = $5 " +
      "WHERE f.id = $1 AND f.business_id = $2 AND m.direction = 'outbound' AND ($3::text <> 'image' OR f.mime_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp'))",
    [fileId, delivery.businessId, kind, delivery.messageId, delivery.conversationId],
  );
}

type PlainPart = Extract<MessagePart, { type: 'text' | 'image' | 'file' }>;
function isPlainPart(part: MessagePart): part is PlainPart {
  return part.type === 'text' || part.type === 'image' || part.type === 'file';
}

export async function toLineMessages(delivery: OutboundDelivery): Promise<LineMessage[]> {
  const { businessId, conversationId, messageId, parts } = delivery;
  let language: Promise<LineLanguage> | undefined;
  const customerLanguage = () => language ??= getCustomerLanguage(conversationId, { businessId });

  async function formatPlainPart(part: PlainPart): Promise<PlainLineMessage[]> {
    if (part.type === 'text') return asText(part.text);
    if (part.type === 'image' && (!config.PUBLIC_BASE_URL || new URL(config.PUBLIC_BASE_URL).protocol !== 'https:')) {
      return asText(lineLabels[await customerLanguage()].pictureUnavailable);
    }
    const file = await loadUpload(delivery, part.fileId, part.type);
    if (!file) {
      const labels = lineLabels[await customerLanguage()];
      return asText(part.type === 'image' ? labels.pictureUnavailable : labels.unavailable);
    }
    const issuedAt = file.created_at.getTime();
    if (part.type === 'image') {
      return [{
        type: 'image',
        originalContentUrl: signedMediaUrl(part.fileId, { variant: 'original', ttlSeconds: 3_600 }, issuedAt),
        previewImageUrl: signedMediaUrl(part.fileId, { variant: 'preview', ttlSeconds: 3_600 }, issuedAt),
      }];
    }
    const name = Array.from(file.original_name).slice(0, 120).join('');
    return asText(name + '\n' + signedMediaUrl(part.fileId, { variant: 'original', ttlSeconds: 604_800 }, issuedAt));
  }

  if (parts.every(isPlainPart)) return (await Promise.all(parts.map(formatPlainPart))).flat();

  let outboundTimestamp: Promise<{ created_at: Date } | null> | undefined;
  return formatLineFlexDelivery(parts, {
    language: await customerLanguage(),
    async resolveSquareImage(fileId) {
      if (!config.PUBLIC_BASE_URL?.startsWith('https://')) return null;
      const file = await loadUpload(delivery, fileId, 'image');
      return file ? signedMediaUrl(fileId, { variant: 'square', ttlSeconds: 3_600 }, file.created_at.getTime()) : null;
    },
    async resolveActionData(request) {
      if (request.source === 'review') return mintLineAction(delivery, request);

      outboundTimestamp ??= db.maybeOne<{ created_at: Date }>(
        "SELECT created_at FROM messages WHERE id = $1 AND business_id = $2 AND conversation_id = $3 AND direction = 'outbound'",
        [messageId, businessId, conversationId],
      );
      const row = await outboundTimestamp;
      if (!row) return null;
      const kind = /^(booking|appointment)([:_-]|$)/i.test(request.proposalId) ? 'booking' : 'order';
      // The owner service enforces the proposal's own expiry. Generic buttons have no expiry in the shared contract.
      const expiresAt = new Date(row.created_at.getTime() + 120 * 60 * 1_000).toISOString();
      return mintLineAction(delivery, { ...request, kind, expiresAt });
    },
  }, formatPlainPart);
}
