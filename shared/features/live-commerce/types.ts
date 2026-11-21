/** One product code found in a text. Prices and names come from the catalog, never from the text. */
export interface ProductCodeMatch {
  code: string;
  /** Normalised key used for lookups (upper-case, NFKC). */
  codeKey: string;
  itemId: string;
  variantId: string | null;
  quantity: number;
  note: string;
  name: string | null;
  sku: string | null;
  unitPriceMinor: number | null;
  soldOut: boolean;
  /** true = the item has variants and the code does not pick one. */
  needsVariant: boolean;
}
