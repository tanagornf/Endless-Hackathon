export type ImportKind = 'csv' | 'xlsx' | 'pdf' | 'text' | 'url';
export type ImportTarget = 'catalog' | 'faq' | 'article';
export type ImportState = 'queued' | 'parsing' | 'awaiting_mapping' | 'extracting' | 'validating' | 'review' | 'committing' | 'done' | 'failed' | 'cancelled';
export type ImportRowStatus = 'pending' | 'ready' | 'error' | 'excluded' | 'written' | 'updated' | 'skipped';
export type CatalogField = 'sku' | 'name' | 'nameEn' | 'description' | 'category' | 'price' | 'unit' | 'stock' | 'durationMinutes';
export type FaqField = 'question' | 'answer' | 'folder';
export type ImportPhase = 'read' | 'detect' | 'chunk' | 'extract' | 'validate' | 'write';

export interface ImportMapping {
  catalog?: Partial<Record<CatalogField, number>>;
  faq?: Partial<Record<FaqField, number>>;
}

export interface ImportOptions {
  mode: 'extract_faq' | 'as_article';
  folderName: string;
  catalogMode: 'create_only' | 'update_existing';
  allowReimport: boolean;
  delimiter?: ',' | ';' | '\t';
}

export interface DetectedMapping {
  target: 'catalog' | 'faq' | null;
  mapping: ImportMapping;
  confidence: 'high' | 'low';
}

export interface CatalogRowData {
  sku: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  category: string | null;
  priceMinor: number;
  unit: string | null;
  stock: number | null;
  durationMinutes: number | null;
  kind: 'product' | 'service';
  existing: { itemId: string; priceMinor: number; name: string } | null;
}

export interface FaqRowData { question: string; answer: string; sourceQuote: string | null; folder: string | null }
export interface ArticleRowData { title: string; body: string }
export type ImportData = CatalogRowData | FaqRowData | ArticleRowData;

export interface ImportRowView {
  id: string;
  rowNo: number;
  status: ImportRowStatus;
  target: ImportTarget | null;
  data: ImportData | null;
  cells: string[] | null;
  error: { code: string; column: string | null; message: string } | null;
  warnings: { code: string; itemId?: string }[];
  createdRef: string | null;
}

export interface ImportTimings {
  uploadedAt: string;
  parsedAt: string | null;
  readyAt: string | null;
  commitStartedAt: string | null;
  committedAt: string | null;
  parseMs: number | null;
  reviewMs: number | null;
  commitMs: number | null;
  totalMs: number | null;
}

export interface ImportView {
  id: string;
  kind: ImportKind;
  target: ImportTarget | null;
  state: ImportState;
  phase: ImportPhase | null;
  sourceLabel: string;
  sourceUrl: string | null;
  sizeBytes: number;
  progress: { done: number; total: number } | null;
  header: string[] | null;
  mapping: ImportMapping | null;
  detected: DetectedMapping | null;
  options: ImportOptions;
  counts: Record<'total' | 'ready' | 'error' | 'excluded' | 'written' | 'updated' | 'skipped', number>;
  duplicate: { importId: string; version: number } | null;
  version: number | null;
  warnings: { code: string; detail?: string }[];
  moderationFlagged: boolean;
  error: { code: string; message: string } | null;
  timings: ImportTimings;
  createdBy: string | null;
  createdAt: string;
}
