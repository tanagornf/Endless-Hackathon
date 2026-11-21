export interface PackingAddress {
  name?: string; phone?: string; line1?: string; line2?: string; district?: string; province?: string; postalCode?: string;
}
export interface PackingOrder {
  id: string;
  number: string;
  version: number;
  status: 'awaiting_payment' | 'paid' | 'preparing';
  shipByAt: string | null;
  address: PackingAddress | null;
  items: { name: string; sku: string; quantity: number }[];
}
export interface PackingUpdate {
  expectedVersion: number;
  shipByAt: string | null;
  address: PackingAddress;
}
