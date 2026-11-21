import { z } from 'zod';

export const ImportId = z.string().uuid();
const catalogField = z.enum(['sku', 'name', 'nameEn', 'description', 'category', 'price', 'unit', 'stock', 'durationMinutes']);
const faqField = z.enum(['question', 'answer', 'folder']);
const index = z.number().int().min(0).max(29);

const options = z.object({
  mode: z.enum(['extract_faq', 'as_article']),
  folderName: z.string().trim().min(1).max(100).refine(value => !/[\r\n]/u.test(value)),
  catalogMode: z.enum(['create_only', 'update_existing']),
  allowReimport: z.boolean(),
  delimiter: z.enum([',', ';', '\t']).optional(),
}).strict();

export const defaultOptions = {
  mode: 'extract_faq', folderName: 'นำเข้า', catalogMode: 'create_only', allowReimport: false,
} as const;

export const ImportOptionsInput = options.partial();
export const MappingBody = z.object({
  target: z.enum(['catalog', 'faq']),
  mapping: z.object({
    catalog: z.partialRecord(catalogField, index).optional(),
    faq: z.partialRecord(faqField, index).optional(),
  }).strict(),
  options: ImportOptionsInput.optional(),
}).strict();

const cursor = z.string().min(1).max(200).optional();
export const ListQuery = z.object({ cursor, limit: z.coerce.number().int().min(1).max(100).default(30) });
export const RowsQuery = z.object({
  cursor,
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(['pending', 'ready', 'error', 'excluded', 'written', 'updated', 'skipped']).optional(),
});

export const UploadBody = z.object({
  options: z.string().max(2048).optional().transform((value, ctx) => {
    if (!value) return defaultOptions;
    try {
      const parsed = ImportOptionsInput.safeParse(JSON.parse(value));
      if (parsed.success) return { ...defaultOptions, ...parsed.data };
    } catch {
      // Invalid JSON and invalid options use the same API validation error.
    }
    ctx.addIssue({ code: 'custom', message: 'Invalid import options' });
    return z.NEVER;
  }),
}).strict();
