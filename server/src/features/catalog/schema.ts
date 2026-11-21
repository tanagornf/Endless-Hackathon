import { z } from 'zod';

export const ListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(100).optional(),
  kind: z.enum(['product', 'service']).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
  cursor: z.string().max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type ListQuery = z.infer<typeof ListQuery>;
