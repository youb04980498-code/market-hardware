export interface Product {
  productId: string;
  sku: string;
  name: string;
  description: string;
  brand: string;
  category: string;
  priceCents: number;
  currency: string;
  active: boolean;
  attributes: Record<string, unknown>;
  publicationVersion: number;
  publishedAt: string;
  validationStatus: string;
  sourceSystem: string;
}
export interface ProductPage {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}
export interface User {
  user_id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: string[];
}
export interface Tokens {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in: number;
}
export interface OrderLine {
  product_id: number;
  product_name: string | null;
  sku: string | null;
  quantity: number;
  unit_price_cents: number;
  warehouse_id: number | null;
  publication_version: number | null;
}
export interface Order {
  order_id: number;
  status: string;
  total_cents: number;
  currency: string;
  created_at: string;
  items: OrderLine[];
  complete: boolean;
  saga: {
    step: string;
    payment_id: number | null;
    failure_code: string | null;
    attempts: number;
    next_attempt_at: string;
  } | null;
}
export interface OrderPage {
  items: Order[];
  total: number;
  page: number;
  page_size: number;
}
export interface Stock {
  product_id: number;
  quantity: number;
  reserved_quantity: number;
  available: number;
}
export interface WarehouseStock extends Stock {
  warehouse_id: number;
  name: string;
  city: string;
}
export interface CartBody {
  items: { product_id: number; quantity: number }[];
  warehouse_id: number;
}
export interface ValidatedCart {
  items: OrderLine[];
  total_cents: number;
  currency: string;
  valid: boolean;
  availability: {
    product_id: number;
    available: number;
    sufficient: boolean;
  }[];
}
export interface Payment {
  payment_id: number;
  order_id: number;
  amount_cents: number;
  status: string;
  refunds?: { refund_id: string; status: string; amount_cents: number }[];
}
