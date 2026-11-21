import type { ImagePart } from '@nless/shared/core/types';
import { storage } from '../../core';
import { getCatalogItemDetails } from '../catalog/service';
import type { ReplyContext } from './context';
import type { TurnDraft } from './repo';

const photoMimes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const normalize = (value: string) => value.normalize('NFKC').toLowerCase();

export async function getReplyProductImages(
  businessId: string,
  context: Pick<ReplyContext, 'catalogRequest' | 'prices'>,
  draft: Pick<TurnDraft, 'productRefs' | 'parts'>,
  signal: AbortSignal,
): Promise<ImagePart[]> {
  const limit = 5 - draft.parts.length;
  if (limit < 1 || signal.aborted) return [];

  const requestedSkus = new Set(context.catalogRequest.skus.map(normalize));
  const selected = new Map(draft.productRefs.flatMap(({ itemId, sku, name }) => {
    const evidence = context.prices.find(({ quote }) => quote.itemId === itemId && quote.sku === sku);
    if (!evidence || requestedSkus.size && ![sku, evidence.itemSku].some((key) => requestedSkus.has(normalize(key)))) return [];
    return [[itemId, { quote: evidence.quote, name }] as const];
  }));
  if (!selected.size) return [];

  const details = await getCatalogItemDetails(businessId, [...selected.keys()]);
  if (signal.aborted) return [];
  const attached = new Set<string>();
  const images: ImagePart[] = [];
  for (const item of details) {
    if (images.length === limit || signal.aborted) break;
    const product = selected.get(item.id);
    if (!product || item.businessId !== businessId || item.kind !== 'product' || !item.active) continue;
    const { quote, name } = product;
    const variant = item.variants.find(({ id }) => id === quote.variantId);
    if ((quote.variantId && !variant) || (variant?.sku ?? item.sku) !== quote.sku) continue;

    for (const { fileId } of item.images) {
      if (signal.aborted) break;
      if (attached.has(fileId)) continue;
      const upload = await storage.read(fileId, { businessId }).catch(() => null);
      if (!upload?.bytes.length || upload.file.businessId !== businessId || !photoMimes.has(upload.file.mimeType)) continue;
      images.push({ type: 'image', fileId, alt: name });
      attached.add(fileId);
      break;
    }
  }
  return images;
}
