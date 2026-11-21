import type { MessagePart } from '@nless/shared/core/types';
import { db, type OutboundDelivery } from '../../core';
import { getCustomerLanguage } from '../inbox/service';
import { TEXT_CHUNK } from './config';
import { lineLabels } from './labels';
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
export type LineMessage = LineText | LineImage;

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

async function loadUpload(delivery: OutboundDelivery, part: Extract<MessagePart, { type: 'file' | 'image' }>) {
  if (!validMediaFileId(part.fileId)) return null;
  return db.maybeOne<{ original_name: string; created_at: Date }>(
    "SELECT f.original_name, m.created_at FROM files f JOIN messages m ON m.id = $4 AND m.business_id = f.business_id WHERE f.id = $1 AND f.business_id = $2 AND ($3::text <> 'image' OR f.mime_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp'))",
    [part.fileId, delivery.businessId, part.type, delivery.messageId],
  );
}

export async function toLineMessages(delivery: OutboundDelivery): Promise<LineMessage[]> {
  const messages: LineMessage[] = [];
  for (const part of delivery.parts) {
    switch (part.type) {
      case 'text':
        messages.push(...asText(part.text));
        break;
      case 'product_card':
        messages.push(...asText(part.altText));
        break;
      case 'image':
      case 'file': {
        const file = await loadUpload(delivery, part);
        if (!file) {
          const language = await getCustomerLanguage(delivery.conversationId, { businessId: delivery.businessId });
          messages.push(...asText(part.type === 'image' ? lineLabels[language].picture : lineLabels[language].unavailable));
          break;
        }
        if (part.type === 'image') {
          messages.push({
            type: 'image',
            originalContentUrl: signedMediaUrl(part.fileId, { variant: 'original', ttlSeconds: 3_600 }, file.created_at.getTime()),
            previewImageUrl: signedMediaUrl(part.fileId, { variant: 'preview', ttlSeconds: 3_600 }, file.created_at.getTime()),
          });
        } else {
          const name = Array.from(file.original_name).slice(0, 120).join('');
          messages.push(...asText(name + '\n' + signedMediaUrl(part.fileId, { variant: 'original', ttlSeconds: 604_800 }, file.created_at.getTime())));
        }
        break;
      }
    }
  }
  return messages;
}
