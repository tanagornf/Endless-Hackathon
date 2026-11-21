export interface MerchantProductEvidence {
  sku: string;
  name: string;
  conversations: number;
  withoutOrder: number;
}

export interface MerchantReport {
  since: string;
  until: string;
  conversations: number;
  customers: number;
  /** Null if the order service cannot provide a complete cohort. */
  orders: number | null;
  handoffs: number;
  pendingSupport: number;
  /** Null when an incomplete read would make SKU suggestions misleading. */
  products: MerchantProductEvidence[] | null;
}
