import type { MessagePart } from '@nless/shared/core/types';
import { TEXT_CHUNK } from './config';

export interface LineText {
  type: 'text';
  text: string;
}

export function splitLineText(text: string): string[] {
  const characters = Array.from(text.trim());
  const chunks: string[] = [];
  for (let start = 0; start < characters.length;) {
    const end = Math.min(start + TEXT_CHUNK, characters.length);
    let chunk = characters.slice(start, end).join('');
    if (end < characters.length) {
      const tailStart = start + Math.floor(TEXT_CHUNK / 2);
      const tail = characters.slice(tailStart, end).join('');
      const breakAt = [tail.lastIndexOf('\n\n'), tail.lastIndexOf('\n'), tail.lastIndexOf(' ')].find((index) => index >= 0);
      if (breakAt !== undefined) {
        chunk = characters.slice(start, tailStart).join('') + tail.slice(0, breakAt + 1);
      }
    }
    start += Array.from(chunk).length;
    const trimmed = chunk.trim();
    if (trimmed) chunks.push(trimmed);
  }
  return chunks;
}

export function toLineText(parts: MessagePart[]): LineText[] {
  return parts.flatMap((part) => {
    const text = part.type === 'text' ? part.text : part.type === 'product_card' ? part.altText : '';
    return splitLineText(text).map((chunk) => ({ type: 'text', text: chunk }));
  });
}
