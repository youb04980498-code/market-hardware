import { request } from "./client";
export type Meta = {
  release_id: string;
  snapshot_at: string;
  last_refresh_at: string;
  stale: boolean;
  pipeline_state: string;
  error_code?: string | null;
  freshness_seconds: number;
  revenue_basis: string;
};
export type Result<T> = {
  data: T;
  metadata: Meta;
  definitions: Record<string, string>;
};
export type Overview = {
  order_count: number;
  paid_order_count: number;
  cancelled_order_count: number;
  pending_order_count: number;
  gross_cents: number;
  refunded_cents: number;
  net_cents: number;
  aov_cents: number;
  captured_order_count: number;
  registered_customers: number;
  purchasing_customers: number;
  repeat_customers: number;
  units_sold: number;
};
export type Revenue = {
  period: string;
  gross_cents: number;
  refunded_cents: number;
  net_cents: number;
};
export type ProductRow = {
  product_id: number;
  name: string;
  category: string;
  units_sold: number;
  gross_cents: number;
  refunded_cents: number;
  net_cents: number;
};
export type InventoryRow = {
  product_id: number;
  warehouse_id: number;
  warehouse: string;
  quantity: number;
  reserved_quantity: number;
  available: number;
};
export type Pipeline = {
  pipeline: {
    state: string;
    metrics: {
      kafka_lag?: number;
      bronze_records?: number;
      unique_events?: number;
      duplicate_records?: number;
      invalid_records?: number;
      late_records?: number;
      last_ingestion_at?: string;
      lag_measured_at?: string;
    };
  };
  reconciliation: {
    status: string;
    checks: {
      metric: string;
      source: number;
      analytical: number;
      difference: number;
    }[];
  };
};
export const analytics = <T>(path: string, query = "") =>
  request<Result<T>>("/api/analytics/" + path + (query ? "?" + query : ""));
