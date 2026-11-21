import { AppError } from '../../core';
import type { ProductCodeMatch } from '@nless/shared/features/live-commerce/types';

/** @owner F22 live-commerce · A2 · consumers: C2 F21 comments, B2 F10 (cross-lane since v3)
 *  Reads product codes in a customer message. Only codes registered for THIS business count. A code must stand alone (not inside a
 *  word: 'XA12', 'A12B' do not match 'A12'); a code containing Thai letters must be separated from Thai text by whitespace or punctuation.
 *  Quantity 1-99 may follow: 'A12x2', 'A12 2', 'A12 x 2', 'A12 2ชิ้น', 'A12*3'. At most opts.maxCodes (default 10; comments use 3) distinct codes,
 *  repeated codes add their quantities (cap 99). Codes whose item is deleted/inactive are skipped. resolve (default true) fills name / sku / price
 *  / soldOut from the catalog (never trust the text for prices). Never throws for unknown text: returns [].
 *  @fake [] */
export async function findProductCodes(businessId: string, text: string, opts?: { maxCodes?: number; resolve?: boolean }): Promise<ProductCodeMatch[]> {
  return [];
}
