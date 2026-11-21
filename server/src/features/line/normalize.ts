import type { MessagePart } from '@nless/shared/core/types';
import { z } from 'zod';

export const LineEvent = z.object({
  type: z.string(),
  webhookEventId: z.string().min(1),
  timestamp: z.number().finite(),
  source: z.object({ type: z.string(), userId: z.string().min(1).optional() }).optional(),
  replyToken: z.string().min(1).optional(),
  message: z.object({
    id: z.string().min(1), type: z.string(), text: z.string().optional(),
    keywords: z.array(z.string()).optional(),
  }).optional(),
});
export type LineEvent = z.infer<typeof LineEvent>;

export function inboundTextParts(message: NonNullable<LineEvent['message']>, language: 'th' | 'en'): { parts: MessagePart[]; triggerAi: boolean } | null {
  if (message.type === 'text') {
    const text = Array.from((message.text ?? '').replace(/\0/g, '').trim()).slice(0, 5_000).join('');
    return text ? { parts: [{ type: 'text', text }], triggerAi: true } : null;
  }
  if (message.type === 'sticker') {
    const label = language === 'en' ? '[Sticker]' : '[สติกเกอร์]';
    const description = message.keywords?.slice(0, 3).map((value) => Array.from(value).slice(0, 100).join('')).join(', ');
    return { parts: [{ type: 'text', text: description ? label + ': ' + description : label }], triggerAi: false };
  }
  return null;
}
