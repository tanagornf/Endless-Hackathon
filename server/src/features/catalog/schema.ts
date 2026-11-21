import { z } from 'zod';
import { PRICE_MAX_MINOR } from '@nless/shared/features/catalog/money';
import { SKU_RE } from './sku';

export const ListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(100).optional(),
  kind: z.enum(['product', 'service']).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
  cursor: z.string().max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type ListQuery = z.infer<typeof ListQuery>;


export const CatalogSku = z.string().trim().transform((value) => value.normalize('NFKC')).pipe(z.string().regex(SKU_RE));
const Minor = z.number().int().min(0).max(PRICE_MAX_MINOR);
const Stock = z.number().int().min(0).max(1_000_000).nullable();
const Name = z.string().trim().min(1).max(255);
const Description = z.string().max(2000).nullable();
const Category = z.string().trim().min(1).max(100).nullable();
const Unit = z.string().trim().min(1).max(30);
const Duration = z.number().int().min(5).max(1440).nullable();
const ExpectedVersion = z.number().int().min(1).max(2_147_483_647);

const VariantBody = z.object({
  name: z.string().trim().min(1).max(100),
  sku: CatalogSku.nullable().default(null),
  priceMinor: Minor.nullable().default(null),
  stock: Stock.default(null),
  active: z.boolean().default(true),
}).strict();

export const CreateItemBody = z.object({
  sku: CatalogSku,
  kind: z.enum(['product', 'service']),
  name: Name,
  nameEn: Name.nullable().default(null),
  description: Description.default(null),
  category: Category.default(null),
  priceMinor: Minor,
  unit: Unit.default('ชิ้น'),
  stock: Stock.default(null),
  shippable: z.boolean().default(true),
  durationMinutes: Duration.default(null),
  active: z.boolean().default(true),
  variants: z.array(VariantBody).max(50).default([]),
}).strict().superRefine((value, ctx) => {
  if ((value.kind === 'service') !== (value.durationMinutes !== null)) {
    ctx.addIssue({ code: 'custom', path: ['durationMinutes'], message: 'Set a duration only for services' });
  }
  if (value.kind === 'service' && (value.stock !== null || value.shippable || value.variants.some((variant) => variant.stock !== null))) {
    ctx.addIssue({ code: 'custom', path: ['kind'], message: 'Services have no stock or shipping' });
  }
});

export const PatchItemBody = z.object({
  expectedVersion: ExpectedVersion,
  sku: CatalogSku.optional(),
  name: Name.optional(),
  nameEn: Name.nullable().optional(),
  description: Description.optional(),
  category: Category.optional(),
  priceMinor: Minor.optional(),
  unit: Unit.optional(),
  stock: Stock.optional(),
  shippable: z.boolean().optional(),
  durationMinutes: Duration.optional(),
  active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 1, 'Nothing to change');

export type CreateItemBody = z.infer<typeof CreateItemBody>;
export type PatchItemBody = z.infer<typeof PatchItemBody>;


export const SkuCheckQuery = z.object({
  sku: CatalogSku,
  excludeItemId: z.string().uuid().optional(),
}).strict();
