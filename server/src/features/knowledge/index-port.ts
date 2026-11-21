import { SEED } from '@nless/shared/core/fixtures';
import type { KnowledgeIndexView } from '@nless/shared/features/knowledge/types';

type Revision = { businessId: string; itemId: string; revision: number };

export async function indexKnowledgeRevision(input: Revision): Promise<{ jobId: string; deduped: boolean }> {
  return { jobId: 'pending-knowledge-index:' + input.itemId, deduped: false };
}

export async function setSearchable(_input: { businessId: string; itemId: string; revision: number | null }): Promise<void> {}

export async function setItemFolder(_input: { businessId: string; itemId: string; folderId: string | null }): Promise<void> {}

export async function getIndexStates(businessId: string, itemIds: string[]): Promise<Record<string, KnowledgeIndexView>> {
  const business = SEED.businesses.find((entry) => entry.id === businessId);
  if (!business) return {};
  const wanted = new Set(itemIds);
  return Object.fromEntries(SEED.knowledge
    .filter((entry) => entry.businessAlias === business.alias && wanted.has(entry.id) && entry.indexState === 'ready')
    .map((entry) => [entry.id, { revision: entry.revision, state: 'ready', error: null, indexedAt: null }]));
}
