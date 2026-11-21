import { AppError } from '../../core';
import type { PriceQuote, ProductRef } from '@nless/shared/features/catalog/types';
import { resolveProduct } from './refs';
import { itemView } from './repo';

export async function getPrice(
  businessId: string,
  input: ProductRef & { variantId?: string | null; quantity?: number },
): Promise<PriceQuote> {
  const quantity = input.quantity === undefined ? 1 : input.quantity;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) {
    throw new AppError('VALIDATION_ERROR', 'Quantity must be an integer between 1 and 10000', { details: { field: 'quantity' } });
  }
  const row = await resolveProduct(businessId, input);
  if (!row) throw new AppError('NOT_FOUND', 'Catalog item not found');
  const item = itemView(row);
  const variantId = input.variantId ?? row.matched_variant_id;
  const variant = variantId === null ? undefined : item.variants.find((entry) => entry.id === variantId.toLowerCase());
  if (variantId !== null && !variant) throw new AppError('NOT_FOUND', 'Catalog variant not found');
  const unitPriceMinor = variant?.priceMinor ?? item.priceMinor;
  const available = variant?.stock ?? item.stock;
  return {
    itemId: item.id, variantId: variant?.id ?? null, sku: variant?.sku ?? item.sku,
    name: variant ? item.name + ' — ' + variant.name : item.name,
    quantity, unitPriceMinor, subtotalMinor: unitPriceMinor * quantity, currency: item.currency, available,
    soldOut: available !== null && available < quantity, version: item.version,
  };
}
