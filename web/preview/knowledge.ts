import type { KnowledgeItemDetail } from '../../shared/features/knowledge/types';

const updatedAt = new Date().toISOString();
const folder = { id: 'product-guide', name: 'Product guide', createdAt: updatedAt, itemCount: 3 };
const articles = [
  { id: 'tote-sizing', title: 'Will the canvas tote fit my laptop?', kind: 'faq', status: 'active',
    body: 'The Everyday Canvas Tote fits a 13-inch laptop. An inside pocket keeps the charger separate.' },
  { id: 'tote-care', title: 'Canvas care guide', kind: 'article', status: 'active',
    body: 'Brush off loose dirt. Spot-clean the canvas with a damp cloth and let the bag air-dry.' },
  { id: 'gift-wrap', title: 'Can I add gift wrapping?', kind: 'faq', status: 'draft',
    body: 'Choose a kraft-paper wrap and a handwritten gift note when the studio prepares your order.' },
] as const;

const items: KnowledgeItemDetail[] = articles.map(article => ({
  ...article, revision: 1, folderId: folder.id, folderName: folder.name, source: 'fixture',
  createdAt: updatedAt, updatedAt, activatedAt: article.status === 'active' ? updatedAt : null,
  submittedAt: null, deletedAt: null, mutable: article.status === 'draft', files: [], warnings: [], moderation: null, webSuggestion: null,
  indexState: article.status === 'active' ? 'ready' : 'not_started',
  index: { state: article.status === 'active' ? 'ready' : 'not_started', revision: 1, error: null,
    indexedAt: article.status === 'active' ? updatedAt : null },
}));

export function knowledgePreview(path: string, params: URLSearchParams) {
  if (path === '/knowledge/folders') return { items: [folder], unfiledCount: 0 };
  if (path === '/knowledge/items') {
    const q = (params.get('q') ?? '').toLowerCase();
    const rows = items.filter(item => (!params.has('status') || item.status === params.get('status'))
      && (!params.has('folderId') || item.folderId === params.get('folderId'))
      && (item.title + ' ' + item.body).toLowerCase().includes(q));
    return { items: rows.map(item => ({ ...item, snippet: item.body })), nextCursor: null };
  }
  if (path.startsWith('/knowledge/items/')) return items.find(item => path === '/knowledge/items/' + item.id);
  if (path === '/knowledge-search/status') return {
    mode: 'fake', embedModel: 'Preview index', embedDim: 0, counts: { ready: 2, not_started: 1, indexing: 0, failed: 0 },
    searchableItems: 2, chunkCount: 2, staleModelChunks: 0, lastIndexedAt: updatedAt,
  };
  if (path === '/knowledge-search/eval/runs') return {
    items: [{ id: 'sample-tote-check', createdAt: updatedAt, metrics: { cases: 2, recallAt3: 1 } }],
  };
}
