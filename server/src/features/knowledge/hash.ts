import { createHash } from 'node:crypto';

export function normalizeContent(value: string): string {
  return value.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[^\S\n]+/g, ' ').trim();
}

export function contentHash(title: string, body: string): string {
  return createHash('sha256').update(normalizeContent(title) + '\n' + normalizeContent(body)).digest('hex');
}
