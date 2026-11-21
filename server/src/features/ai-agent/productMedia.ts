import type { ImagePart } from '@nless/shared/core/types';
import { storage } from '../../core';
import { getCatalogItemDetails } from '../catalog/service';
import { isCatalogPriceFollowUp } from './context';
import type { PriceEvidence, ReplyContext } from './context';
import type { TurnDraft } from './repo';

const photoMimes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const skuToken = /(?<![a-z0-9-])(?=[a-z0-9-]*[a-z])(?=[a-z0-9-]*\d)[a-z0-9]+(?:-[a-z0-9]+)+(?![a-z0-9-])/g;
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
type MediaContext = Pick<ReplyContext, 'catalogRequest' | 'prices'> & Partial<Pick<ReplyContext, 'unanswered'>>;

function latestText(context: MediaContext): string {
  return context.unanswered ? context.unanswered.at(-1) ?? '' : context.catalogRequest.text;
}

function namedProduct(text: string): string {
  return normalize(text).replace(/[.!?？]+$/u, '')
    .replace(/^(?:how much (?:is|are|does)|what(?:'s| is) the price (?:of|for)|(?:can i see|show me) (?:a )?(?:photo|picture|image) of|do you have|is|price (?:of|for))\s+/u, '')
    .replace(/\s+(?:in stock|available|cost|please)$/u, '')
    .replace(/^(?:ขอ(?:ทราบ)?ราคา(?:สินค้า)?|ขอ(?:ดู)?(?:รูป|ภาพ)(?:สินค้า)?|มีสินค้า)\s*/u, '')
    .replace(/\s*(?:มีของไหม|พร้อมส่งไหม|เท่า(?:ไหร่|ไร)|หรือไม่|หน่อย|ได้ไหม)?(?:นะ|คะ|ค่ะ|ครับ)*$/u, '')
    .trim();
}

export function latestReplyPrices(context: MediaContext): PriceEvidence[] {
  const latest = latestText(context);
  const specified = [...normalize(latest).matchAll(skuToken)].map(([sku]) => sku);
  const scope = context.catalogRequest;
  const followsOneItem = !specified.length && scope.skus.length === 1 && normalize(latest) === normalize(scope.text) &&
    (scope.linkedSameProduct || isCatalogPriceFollowUp(latest));
  const requested = new Set(followsOneItem ? scope.skus.map(normalize) : specified);
  const name = namedProduct(latest);
  return context.prices.filter(({ quote, itemSku, itemNames }) =>
    requested.size ? [quote.sku, itemSku].some((sku) => requested.has(normalize(sku)))
      : Boolean(name) && itemNames.some((itemName) => normalize(itemName) === name),
  );
}

export function currentPhotoRequest(context: ReplyContext): PriceEvidence | null {
  if (!/\b(?:photo|picture|image)s?\b|(?:ขอ|ดู|ส่ง|มี)\s*(?:รูป|ภาพ)|รูปสินค้า|ภาพสินค้า/iu.test(latestText(context))) return null;
  const products = new Map(latestReplyPrices(context).map((price) => [price.quote.itemId, price]));
  return products.size === 1 ? products.values().next().value ?? null : null;
}

export function currentAvailabilityReply(context: ReplyContext): string | null {
  if (!/\b(?:in stock|available|stock left)\b|ยังมีของ|มี(?:สินค้า|ของ)ไหม|พร้อมส่ง|เหลือกี่/iu.test(latestText(context))) return null;
  const products = new Map(latestReplyPrices(context).map((price) => [price.quote.itemId + ':' + price.quote.variantId, price]));
  const price = products.size === 1 ? products.values().next().value : undefined;
  if (!price) return null;
  const { name, quote } = price;
  const inStock = context.rules.stock === 'always' && quote.available !== null && quote.available > 0;
  if (context.language === 'th') {
    if (quote.soldOut) return name + ' สินค้าหมดค่ะ';
    return inStock ? name + ' มีสินค้าอยู่ค่ะ' : 'ยังยืนยันสต็อกของ ' + name + ' ไม่ได้ค่ะ';
  }
  if (quote.soldOut) return name + ' is sold out.';
  return inStock ? name + ' is in stock.' : 'I cannot confirm availability for ' + name + '.';
}

export async function getReplyProductImages(
  businessId: string,
  context: MediaContext,
  draft: Pick<TurnDraft, 'productRefs' | 'parts'>,
  signal: AbortSignal,
): Promise<ImagePart[]> {
  const limit = 5 - draft.parts.length;
  if (limit < 1 || signal.aborted) return [];

  const current = latestReplyPrices(context);
  const selected = new Map(draft.productRefs.flatMap(({ itemId, sku }) => {
    const evidence = current.find(({ quote }) => quote.itemId === itemId && quote.sku === sku);
    return evidence ? [[itemId, evidence] as const] : [];
  }));
  if (!selected.size) return [];

  const details = await getCatalogItemDetails(businessId, [...selected.keys()]);
  if (signal.aborted) return [];
  const attached = new Set<string>();
  const images: ImagePart[] = [];
  for (const item of details) {
    if (images.length === limit || signal.aborted) break;
    const product = selected.get(item.id);
    if (!product || item.businessId !== businessId || item.kind !== 'product' || !item.active || item.version !== product.quote.version) continue;
    const { quote, name } = product;
    const variant = item.variants.find(({ id }) => id === quote.variantId);
    if ((quote.variantId && !variant) || (variant?.sku ?? item.sku) !== quote.sku) continue;

    for (const { fileId } of item.images) {
      if (signal.aborted) break;
      if (attached.has(fileId)) continue;
      const upload = await storage.read(fileId, { businessId }).catch(() => null);
      if (!upload?.bytes.length || upload.file.businessId !== businessId ||
        upload.file.purpose !== 'catalog' || !photoMimes.has(upload.file.mimeType)) continue;
      images.push({ type: 'image', fileId, alt: name });
      attached.add(fileId);
      break;
    }
  }
  return images;
}
