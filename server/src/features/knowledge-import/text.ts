import { truncateCodePoints } from './decode';
import { readyRow, type CheckedRow } from './validate';

const CHUNK_CHARS = 6_000;
const OVERLAP = 300;
const MAX_CHUNKS = 10;
const ARTICLE_CHARS = 8_000;
const MAX_ARTICLES = 60;
export const MAX_TEXT_CHARS = 200_000;

export function splitAtBoundary(text: string, limit: number): string {
  const prefix = truncateCodePoints(text, limit);
  if (prefix.length === text.length) return prefix;
  for (const marker of ['\n\n', '. ', 'ฯ', ' ', '\n']) {
    const index = prefix.lastIndexOf(marker);
    if (index >= Math.floor(prefix.length * 0.7)) return prefix.slice(0, index + marker.length);
  }
  return prefix;
}

export function chunkSource(text: string): { chunks: string[]; truncated: boolean } {
  const chunks: string[] = [];
  let remaining = text.trim();
  let overlap = '';
  while (remaining && chunks.length < MAX_CHUNKS) {
    const block = splitAtBoundary(remaining, CHUNK_CHARS - [...overlap].length);
    chunks.push(overlap + block);
    remaining = remaining.slice(block.length);
    overlap = [...block].slice(-OVERLAP).join('');
  }
  return { chunks, truncated: Boolean(remaining) };
}

function sections(text: string): { title: string; body: string }[] {
  const lines = text.split('\n');
  const parts: { title: string; lines: string[] }[] = [{ title: '', lines: [] }];
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    const heading = /^#{1,2}\s+(.+)$/u.exec(trimmed);
    const plain = trimmed && trimmed.length <= 80 && !/[.ๆฯ]$/u.test(trimmed) && !lines[index + 1]?.trim() &&
      Boolean(lines[index + 2]?.trim());
    if (heading || plain) parts.push({ title: heading?.[1] ?? trimmed, lines: [] });
    else parts.at(-1)!.lines.push(line);
  }
  return parts.map(part => ({ title: part.title, body: part.lines.join('\n').trim() }))
    .filter(part => part.body || part.title);
}

export function prepareArticles(text: string, label: string): { rows: CheckedRow[]; truncated: boolean } {
  const rows: CheckedRow[] = [];
  for (const section of sections(text)) {
    let remaining = section.body || section.title;
    let part = 1;
    while (remaining) {
      if (rows.length >= MAX_ARTICLES) return { rows, truncated: true };
      const chunk = splitAtBoundary(remaining, ARTICLE_CHARS);
      remaining = remaining.slice(chunk.length).trimStart();
      const title = section.title
        ? truncateCodePoints(section.title, 245) + (remaining || part > 1 ? ' (' + part + ')' : '')
        : truncateCodePoints(chunk.split(/\s+/u).slice(0, 8).join(' '), 60) || label + ' (' + (rows.length + 1) + ')';
      rows.push(readyRow(rows.length + 1, { title, body: chunk.trim() }));
      part++;
    }
  }
  return { rows, truncated: false };
}
