import type { MessageRecord } from '@nless/shared/features/inbox/types';
import type { ModelMessage } from '../../core';
import { maskCardNumbers } from './mask';

export const MODEL_HISTORY_LIMIT = 40;
const MESSAGE_CHAR_LIMIT = 4_000;
const HISTORY_CHAR_LIMIT = 24_000;
const graphemes = new Intl.Segmenter();

export function historyMessageText({ parts }: Pick<MessageRecord, 'parts'>): string {
  return parts.flatMap((part) => {
    if (part.type === 'text') return [part.text];
    if (part.type === 'order_review' || part.type === 'booking_review') return ['[การ์ดสรุป]'];
    return [];
  }).join('\n').trim();
}

function clipMessage(text: string, limit: number, isInbound: boolean): string {
  if (text.length <= limit) return text;
  if (!isInbound) return text.slice(0, graphemes.segment(text).containing(limit)?.index ?? limit);

  // A long inbound can place its question after the details. Keep both ends.
  const omission = '\n…\n';
  const headLimit = Math.floor((limit - omission.length) / 2);
  const segments = graphemes.segment(text);
  const headEnd = segments.containing(headLimit)?.index ?? headLimit;
  const tailLimit = text.length - (limit - omission.length - headLimit);
  const tail = segments.containing(tailLimit);
  const tailStart = tail && tail.index < tailLimit ? tail.index + tail.segment.length : tailLimit;
  return text.slice(0, headEnd) + omission + text.slice(tailStart);
}

/** Build prompt messages from ascending history, anchored to the trigger even if paging omitted it. */
export function buildModelHistory(
  history: readonly MessageRecord[],
  inbound: MessageRecord,
): { messages: ModelMessage[]; cardMasked: boolean } {
  const previous = history.filter((message) => message.seq < inbound.seq).slice(-(MODEL_HISTORY_LIMIT - 1));
  const newestFirst = [inbound, ...previous.reverse()];
  const messages: ModelMessage[] = [];
  let remaining = HISTORY_CHAR_LIMIT;
  let cardMasked = false;

  for (const message of newestFirst) {
    if (remaining === 0) break;
    if (message.author === 'system') continue;
    const text = historyMessageText(message);
    const masked = maskCardNumbers(text);
    const content = clipMessage(masked, Math.min(MESSAGE_CHAR_LIMIT, remaining), message === inbound);
    if (!content) continue;
    cardMasked ||= masked !== text;
    messages.push({ role: message.author === 'customer' ? 'user' : 'assistant', content });
    remaining -= content.length;
  }

  return { messages: messages.reverse(), cardMasked };
}
