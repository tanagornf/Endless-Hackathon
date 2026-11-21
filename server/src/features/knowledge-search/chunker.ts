import { CHUNK_MAX_TERMS, CHUNK_OVERLAP_TERMS, CHUNK_TARGET_TERMS, MAX_CHUNK_CHARS, ROW_MODE_MAX_ROWS } from './config';
import { cleanText, countTerms, termsOf, truncateAtWord, wordSpans } from './text';

type Document = { kind: 'faq' | 'article'; title: string; body: string };
export type ChunkKind = Document['kind'] | 'row';
export type Chunk = { chunkNo: number; kind: ChunkKind; title: string; text: string; termCount: number; lexicalTerms: string[] };
const sentences = new Intl.Segmenter('th', { granularity: 'sentence' });

function unitsFor(input: string, termLimit: number, charLimit: number): string[] {
  const units: string[] = [];
  let rest = input.trim();
  while (rest) {
    const spans = wordSpans(rest);
    if (spans.length <= termLimit && rest.length <= charLimit) {
      units.push(rest);
      return units;
    }
    const termEnd = spans[termLimit]?.index ?? rest.length;
    const unit = truncateAtWord(rest, Math.min(charLimit, termEnd));
    if (!unit) return units;
    units.push(unit);
    rest = rest.slice(unit.length).trimStart();
  }
  return units;
}

function groupBody(body: string, prefix: string): string[] {
  const maximum = CHUNK_MAX_TERMS - countTerms(prefix);
  const target = Math.min(CHUNK_TARGET_TERMS, maximum);
  const chars = MAX_CHUNK_CHARS - prefix.length;
  const fits = (text: string, terms = maximum) => text.length <= chars && countTerms(text) <= terms;
  const units = body.split(/\n[ \t]*\n/).map((paragraph) => paragraph.trim()).filter(Boolean)
    .flatMap((paragraph) => fits(paragraph) ? [paragraph] :
      [...sentences.segment(paragraph)].flatMap(({ segment }) =>
        segment.split('\n').flatMap((line) => unitsFor(line, target, chars))));
  const blocks: string[] = [];
  let current = '';
  for (const unit of units) {
    const combined = current ? current + '\n\n' + unit : unit;
    if (!current || fits(combined, target)) {
      current = combined;
      continue;
    }
    blocks.push(current);
    const overlap = wordSpans(current).slice(-CHUNK_OVERLAP_TERMS)[0];
    const withOverlap = overlap ? current.slice(overlap.index) + '\n\n' + unit : unit;
    current = fits(withOverlap) ? withOverlap : unit;
  }
  if (current) blocks.push(current);
  return blocks.map((block) => prefix + block);
}

function rowData(body: string): { rows: string[]; header: string } | null {
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
  const separated = lines.filter((line) => /[|\t]/.test(line) || (line.match(/,/g) ?? []).length >= 2);
  if (lines.length < 3 || separated.length / lines.length < 0.7) return null;
  const first = lines[0];
  const header = !termsOf(first).skus.length && !/\d/.test(first) ? lines.shift()! : '';
  return { rows: lines, header };
}

export function chunkKnowledge(document: Document): { chunks: Chunk[]; rowsTruncated: boolean } {
  const title = cleanText(document.title);
  const body = cleanText(document.body);
  if (!title && !body) return { chunks: [], rowsTruncated: false };
  let kind: ChunkKind = document.kind;
  let bodies: string[];
  let rowsTruncated = false;
  if (kind === 'faq') {
    const prefix = 'คำถาม: ' + title + '\nคำตอบ: ';
    const full = prefix + body;
    bodies = countTerms(full) <= CHUNK_MAX_TERMS && full.length <= MAX_CHUNK_CHARS ? [full] : groupBody(body, prefix);
  } else {
    const table = rowData(body);
    if (table) {
      kind = 'row';
      rowsTruncated = table.rows.length > ROW_MODE_MAX_ROWS;
      const prefix = title + (table.header ? ' | ' + table.header : '') + '\n';
      bodies = table.rows.slice(0, ROW_MODE_MAX_ROWS)
        .map((row) => unitsFor(prefix + row, CHUNK_MAX_TERMS, MAX_CHUNK_CHARS)[0]);
    } else {
      bodies = body ? groupBody(body, title ? title + '\n' : '') : [title];
    }
  }
  return {
    rowsTruncated,
    chunks: bodies.map((text, chunkNo) => {
      const terms = termsOf(title + '\n' + text);
      return { kind, chunkNo, title, text, termCount: countTerms(text), lexicalTerms: [...new Set([...terms.words, ...terms.skus])] };
    }),
  };
}
