import type { MessagePart } from '@nless/shared/core/types';
import { z } from 'zod';
import { lineLabels, type LineLanguage } from './labels';

export const LineEvent = z.object({
  type: z.string(),
  webhookEventId: z.string().min(1),
  timestamp: z.number().finite(),
  source: z.object({ type: z.string(), userId: z.string().min(1).optional() }).optional(),
  replyToken: z.string().min(1).optional(),
  message: z.object({
    id: z.string().min(1), type: z.string(), text: z.string().optional(),
    keywords: z.array(z.string()).optional(), fileName: z.string().optional(),
    contentProvider: z.object({ type: z.string() }).optional(),
    title: z.string().optional(), address: z.string().optional(),
    latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(),
  }).optional(),
  postback: z.object({ data: z.string() }).optional(),
});
export type LineEvent = z.infer<typeof LineEvent>;
export type LineEventMessage = NonNullable<LineEvent['message']>;
export interface NormalizedMessage {
  parts: MessagePart[];
  triggerAi: boolean;
}

function cleanText(text: string) {
  return Array.from(text.replace(/\0/g, '').trim()).slice(0, 5_000).join('');
}

export function inboundTextParts(message: LineEventMessage, language: LineLanguage): NormalizedMessage | null {
  const labels = lineLabels[language];
  if (message.type === 'text') {
    const text = cleanText(message.text ?? '');
    return text ? { parts: [{ type: 'text', text }], triggerAi: true } : null;
  }
  if (message.type === 'sticker') {
    const description = message.keywords?.slice(0, 3).map((value) => Array.from(value).slice(0, 100).join('')).join(', ');
    return { parts: [{ type: 'text', text: description ? labels.sticker + ': ' + description : labels.sticker }], triggerAi: false };
  }
  if (message.type === 'location' && message.latitude !== undefined && message.longitude !== undefined) {
    const text = [labels.location, message.title, message.address, '(' + message.latitude + ', ' + message.longitude + ')'].filter(Boolean).join(' ');
    return { parts: [{ type: 'text', text: cleanText(text) }], triggerAi: true };
  }
  return null;
}
