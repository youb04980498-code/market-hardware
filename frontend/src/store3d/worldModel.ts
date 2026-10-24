import type { Warehouse } from "../admin/data";
export type { Warehouse };
export type WorldOrder = {
  order_id: number;
  status: string;
  total_cents: number;
  currency: string;
  created_at: string;
};
export type WorldPayment = {
  order_id: number;
  payment_id: number;
  status: string;
  amount_cents: number;
  currency: string;
};
export type WorldProduct = {
  productId: string;
  sku: string;
  name: string;
  category: string;
  active: boolean;
};
export type WorldStock = {
  product_id: number;
  warehouse_id: number;
  quantity: number;
  reserved_quantity: number;
  available: number;
};
export type Source<T> = {
  available: boolean;
  data: T | null;
  observed_at?: string;
  error?: string;
};
export type WorldMonitoring = Source<{
  observed_at: string;
  unavailable: string[];
  metrics: Record<
    string,
    { metric: Record<string, string>; value: [number, string] }[] | null
  >;
}>;
export type StreamState = {
  instance: string;
  revision: number;
  broker_connected: boolean;
  duplicates: number;
  rejected: number;
  last_event: { type: string; occurred_at: string } | null;
};
export type WorldSnapshot = {
  observed_at: string;
  stream: StreamState;
  warehouses: Source<{ items: Warehouse[] }>;
  orders: Source<{ items: WorldOrder[]; total: number; truncated: boolean }>;
  payments: Source<{ items: WorldPayment[]; provider: string }>;
  catalog: Source<{
    data: { products: { items: WorldProduct[]; total: number } };
  }>;
  analytics: Source<{
    data: { net_cents: number; order_count: number };
    metadata: { stale: boolean; snapshot_at: string };
  }>;
  cart_telemetry: { available: false; reason: string };
};
export type WorldSelection =
  | { kind: "rack"; id: number; warehouse_id?: number }
  | { kind: "warehouse"; id: number }
  | { kind: "order"; id: number }
  | { kind: "product"; id: number; warehouse_id?: number }
  | null;
export type OrderDetail = WorldOrder & {
  complete: boolean;
  items: {
    product_id: number;
    product_name: string | null;
    sku: string | null;
    quantity: number;
    unit_price_cents: number;
    warehouse_id: number;
  }[];
  payments: Source<{ items: WorldPayment[] }>;
};
export const stageColors: Record<string, string> = {
  PENDING: "#d4b568",
  STOCK_RESERVED: "#8a83ba",
  PAID: "#70a58d",
  PAYMENT_FAILED: "#c17e70",
  CANCELLED: "#9b9b94",
  SHIPPED: "#749dbc",
  DELIVERED: "#4c8f7c",
  REFUNDED: "#a382aa",
};
export function orderPosition(
  status: string,
  index: number,
): [number, number, number] {
  if (status === "SHIPPED")
    return [
      3.8 + (index % 4) * 0.45,
      0.92 + Math.floor((index % 12) / 4) * 0.35,
      4.1 + Math.floor((index % 24) / 12) * 0.5,
    ];
  const lane: Record<string, number> = {
    PENDING: -7,
    STOCK_RESERVED: -4,
    PAID: -1,
    SHIPPED: 3,
    DELIVERED: 7,
    PAYMENT_FAILED: -5,
    CANCELLED: -5,
    REFUNDED: -1,
  };
  if (!(status in lane)) return [0, 0.9, 5.5];
  const rejected = ["PAYMENT_FAILED", "CANCELLED", "REFUNDED"].includes(status);
  return [
    (lane[status] ?? 0) + ((index % 4) - 1.5) * 0.42,
    0.9,
    rejected
      ? 3.5 + Math.floor((index % 8) / 4) * 0.75
      : -3 + Math.floor((index % 24) / 4) * 0.9,
  ];
}
export function canRepresentCheckout(status: string) {
  return [
    "PENDING",
    "STOCK_RESERVED",
    "PAID",
    "PAYMENT_FAILED",
    "CANCELLED",
    "REFUNDED",
  ].includes(status);
}

export function parseSse(
  frame: string,
): { event: string; data: StreamState } | null {
  const lines = frame.replace(/\r/g, "").split("\n");
  const data = lines
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  return {
    event:
      lines
        .find((l) => l.startsWith("event:"))
        ?.slice(6)
        .trim() ?? "message",
    data: JSON.parse(data) as StreamState,
  };
}
