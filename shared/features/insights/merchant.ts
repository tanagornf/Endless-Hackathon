export interface MerchantReport {
  since: string;
  until: string;
  conversations: number;
  customers: number;
  orders: number;
  handoffs: number;
  products: Array<{ sku: string; name: string; conversations: number; withoutOrder: number }>;
}
