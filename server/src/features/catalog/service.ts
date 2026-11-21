import type { CatalogItem, ProductRef } from '@nless/shared/features/catalog/types';
import { resolveProduct } from './refs';
import { itemView } from './repo';

export { parsePriceToMinor } from '@nless/shared/features/catalog/money';
export { getPrice } from './price';
export { checkSku, getCatalogItemDetails, getHistory, getItemAdmin, listCatalogItems, listCategories, listItems } from './repo';
export { createItem, deleteItem, patchItem } from './items';
export { importCatalogItems } from './import';
export { adjustCatalogStock } from './stock';

export async function getProduct(businessId: string, ref: ProductRef): Promise<CatalogItem | null> {
  const row = await resolveProduct(businessId, ref);
  return row ? itemView(row) : null;
}
