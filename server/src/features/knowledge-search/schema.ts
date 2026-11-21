import { z } from 'zod';

const Weights = z.object({
  vec: z.number().min(0).max(1), lex: z.number().min(0).max(1),
  c0: z.number().min(0).max(1), c1: z.number().min(0).max(1),
}).strict().refine((weights) => weights.c1 > weights.c0, 'c1 must be greater than c0');

export const SearchBody = z.object({
  query: z.string().trim().min(1).max(500),
  topK: z.number().int().min(1).max(20).default(5),
  minScore: z.number().min(0).max(1).optional(),
  folderIds: z.array(z.string().uuid()).max(20).optional(),
  strategy: z.enum(['auto', 'lexical', 'vector', 'hybrid']).default('auto'),
  rerank: z.literal(false).default(false),
  weights: Weights.optional(),
}).strict();

export const EvalRunBody = z.object({
  strategy: z.enum(['lexical', 'vector', 'hybrid']).default('hybrid'),
  minScore: z.number().min(0).max(1).optional(),
  weights: Weights.optional(),
  rerank: z.literal(false).default(false),
  includeFixture: z.boolean().default(true),
  includeSaved: z.boolean().default(true),
}).strict();

export type EvalRunBody = z.infer<typeof EvalRunBody>;
export const RunsQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }).strict();
