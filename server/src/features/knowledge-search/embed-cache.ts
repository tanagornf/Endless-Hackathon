import { createHash } from 'node:crypto';
import { AppError, config, db, model } from '../../core';
import { INDEX_DIMENSIONS, QUERY_CACHE_TTL_DAYS } from './config';
import { normalize } from './text';

export function queryCacheKey(modelId: string, dimensions: number, query: string): string {
  return createHash('sha256').update(JSON.stringify([modelId, dimensions, normalize(query)])).digest('hex');
}

type QueryVector = { values: number[]; model: string };

function isUsableVector(values: number[] | undefined): values is number[] {
  return values?.length === INDEX_DIMENSIONS && values.every(Number.isFinite);
}

export async function queryEmbedding(businessId: string, query: string): Promise<{
  vector: QueryVector | null; cacheHit: boolean;
}> {
  const miss = { vector: null, cacheHit: false };
  if (config.MODEL_MODE === 'fake') return miss;
  const modelId = config.OPENAI_EMBED_MODEL;
  const dimensions = config.EMBED_DIM;
  if (dimensions !== INDEX_DIMENSIONS) return miss;
  const key = queryCacheKey(modelId, dimensions, query);
  const cached = await db.maybeOne<{ values: number[] }>(
    `SELECT embedding::real[] AS values FROM knowledge_query_cache
     WHERE business_id=$1 AND cache_key=$2 AND created_at > now() - $3::int * interval '1 day'`,
    [businessId, key, QUERY_CACHE_TTL_DAYS],
  ).catch(() => null);
  if (isUsableVector(cached?.values)) return { vector: { values: cached.values, model: modelId }, cacheHit: true };

  try {
    const result = await model.embed({ usage: { featureId: 'F07', purpose: 'embed-query', businessId }, texts: [query], purpose: 'query' });
    const values = result.vectors[0];
    if (result.mode !== 'openai' || result.dim !== dimensions || !isUsableVector(values)) return miss;
    if (result.model === modelId) {
      await db.query(
        `INSERT INTO knowledge_query_cache (business_id,cache_key,embedding) VALUES ($1,$2,$3::vector)
         ON CONFLICT (business_id,cache_key) DO UPDATE SET embedding=EXCLUDED.embedding,created_at=EXCLUDED.created_at
         WHERE knowledge_query_cache.created_at <= now() - $4::int * interval '1 day'`,
        [businessId, key, db.toVector(values), QUERY_CACHE_TTL_DAYS],
      ).catch(() => undefined);
    }
    return { vector: { values, model: result.model }, cacheHit: false };
  } catch (error) {
    if (error instanceof AppError && (error.code.startsWith('PROVIDER_') || error.code === 'RATE_LIMITED')) return miss;
    throw error;
  }
}

export async function pruneQueryCache(businessId: string): Promise<void> {
  await db.query("DELETE FROM knowledge_query_cache WHERE business_id=$1 AND created_at <= now() - $2::int * interval '1 day'",
    [businessId, QUERY_CACHE_TTL_DAYS]);
}
