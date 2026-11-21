import { C0, C0_XLANG, C1, SKU_FLOOR, W_LEX, W_VEC, W_XLANG } from './config';
import type { RetrievalStrategy, RetrievalWeights } from '@nless/shared/features/knowledge-search/types';
import { mixedQuery, scriptOf } from './text';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function scoreChunk(query: string, terms: ReturnType<typeof import('./text').termsOf>,
  chunk: { text: string; lexical_terms: string[]; cos: number | null; population: number; document_frequency: Record<string, number> },
  strategy: RetrievalStrategy, weights?: RetrievalWeights) {
  const present = new Set(chunk.lexical_terms);
  const matchedTerms: string[] = [];
  let sum = 0;
  let matched = 0;
  for (const term of [...terms.words, ...terms.skus]) {
    const share = (chunk.document_frequency[term] ?? 0) / Math.max(1, chunk.population);
    const df = share >= 0.30 ? 0.3 : share >= 0.15 ? 0.6 : 1;
    const weight = terms.skus.includes(term) ? 2 : (term.length >= 3 ? 1 : 0.5) * df;
    sum += weight;
    if (present.has(term)) {
      matchedTerms.push(term);
      matched += weight;
    }
  }
  const lex = sum ? matched / sum : 0;
  const crossPair = scriptOf(query) !== scriptOf(chunk.text);
  const mixed = mixedQuery(query);
  const skuHit = terms.skus.length > 0 && terms.skus.every((sku) => present.has(sku));
  const c0 = weights?.c0 ?? C0;
  const c1 = weights?.c1 ?? C1;
  const c0Xlang = Math.min(C0_XLANG, c0);
  const vecNorm = chunk.cos === null ? null : clamp01((chunk.cos - c0) / (c1 - c0));
  const vecCross = chunk.cos === null ? 0 : clamp01((chunk.cos - c0Xlang) / (c1 - c0Xlang));
  const final = strategy === 'lexical' ? lex : strategy === 'vector' ? vecNorm ?? 0
    : Math.max((weights?.vec ?? W_VEC) * (vecNorm ?? 0) + (weights?.lex ?? W_LEX) * lex,
    skuHit ? SKU_FLOOR : 0, crossPair ? W_XLANG * vecCross : 0, mixed ? W_XLANG * (vecNorm ?? 0) : 0);
  return { lex, final: clamp01(final), vecNorm, skuHit, crossScript: crossPair || mixed, matchedTerms };
}
