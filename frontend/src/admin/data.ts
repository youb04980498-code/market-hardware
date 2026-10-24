import { request } from "../api/client";
import { products } from "../api/market";
import {
  analytics,
  type InventoryRow,
  type Meta,
  type ProductRow,
  type Overview,
  type Revenue,
  type Pipeline,
} from "../api/analytics";
import type { OrderPage } from "../types";

export type Warehouse = {
  warehouse_id: number;
  name: string;
  city: string;
  capacity_units: number;
  classification: string;
  physical: number;
  reserved: number;
  available: number;
  low_stock_count: number;
  utilization_percent: number | null;
};
export type Incident = {
  alert_id: string;
  type: string;
  severity: string;
  entity_reference: string;
  first_detected_at: string;
  last_observed_at: string;
  status: string;
  details: Record<string, string | number>;
};
export type InventoryData = {
  items: InventoryRow[];
  total: number;
  threshold: number;
  warehouses: [number, string][];
};
export type Sample = {
  metric: Record<string, string>;
  value: [number, string];
};
export type Observation = {
  observed_at?: string;
  metrics: Record<string, Sample[] | null>;
  infrastructure_alerts:
    | {
        labels: Record<string, string>;
        annotations: Record<string, string>;
        startsAt?: string;
        status?: { state: string };
      }[]
    | null;
  unavailable: string[];
  links: Record<string, string>;
};
export const warehouseList = () =>
  request<{ items: Warehouse[] }>(
    "/api/inventory/warehouses?include_test=true",
  );
export const incidents = (status = "") =>
  request<{ items: Incident[] }>(
    "/api/analytics/alerts?limit=500" + (status ? "&status=" + status : ""),
  );
export async function allProducts() {
  const first = await products({ pageSize: 100 });
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page++) {
    if (page > 50)
      throw new Error("Catalogue trop volumineux pour cette vue locale.");
    const next = await products({ page, pageSize: 100 });
    if (!next.items.length)
      throw new Error("Catalogue modifié pendant la lecture. Actualisez.");
    items.push(...next.items);
  }
  return items;
}
export async function stockSnapshot() {
  const first = await analytics<InventoryData>(
    "inventory",
    "page_size=100&include_test=true",
  );
  const items = [...first.data.items];
  for (let page = 2; items.length < first.data.total; page++) {
    if (page > 50)
      throw new Error("Snapshot trop volumineux pour cette vue locale.");
    const next = await analytics<InventoryData>(
      "inventory",
      `page_size=100&include_test=true&page=${page}`,
    );
    if (
      next.metadata.release_id !== first.metadata.release_id ||
      !next.data.items.length
    )
      throw new Error(
        "Le snapshot a changé. Actualisez pour obtenir une vue cohérente.",
      );
    items.push(...next.data.items);
  }
  return { ...first, data: { ...first.data, items } };
}
export async function orderCollection() {
  const first = await request<OrderPage>(
    "/api/orders?all_customers=true&page_size=100&page=1",
  );
  const items = [...first.items];
  for (let page = 2; items.length < Math.min(first.total, 5000); page++) {
    const next = await request<OrderPage>(
      `/api/orders?all_customers=true&page_size=100&page=${page}`,
    );
    if (!next.items.length) break;
    items.push(...next.items);
  }
  return {
    items: [...new Map(items.map((o) => [o.order_id, o])).values()],
    total: first.total,
    truncated: first.total > 5000,
  };
}
export type Business = {
  overview: Overview;
  revenue: Revenue[];
  products: ProductRow[];
  categories: { category: string; net_cents: number }[];
  daily: { date: string; order_count: number }[];
  statuses: { status: string; order_count: number }[];
  metadata: Meta;
  pipeline: Pipeline;
  quarters: { period: string; release_id: string; document: Overview }[];
};
export async function business(
  period = "",
  granularity = "day",
): Promise<Business> {
  const [overview, revenue, top, orders, pipeline, quarters] =
    await Promise.all([
      analytics<Overview>("overview", period),
      analytics<Revenue[]>("revenue", period + "&granularity=" + granularity),
      analytics<{
        items: ProductRow[];
        total: number;
        categories: { category: string; net_cents: number }[];
      }>("products/top", period + "&page_size=100"),
      analytics<{ daily: Business["daily"]; statuses: Business["statuses"] }>(
        "orders",
        period,
      ),
      analytics<Pipeline>("pipeline/status"),
      analytics<Business["quarters"]>("quarters"),
    ]);
  if (
    [revenue, top, orders, pipeline, quarters].some(
      (r) => r.metadata.release_id !== overview.metadata.release_id,
    )
  )
    throw new Error(
      "Une nouvelle version a été publiée pendant la lecture. Actualisez la vue.",
    );
  return {
    overview: overview.data,
    revenue: revenue.data,
    products: top.data.items,
    categories: top.data.categories,
    daily: orders.data.daily,
    statuses: orders.data.statuses,
    metadata: overview.metadata,
    pipeline: pipeline.data,
    quarters: quarters.data,
  };
}
export const dateTime = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString("fr-FR", {
        timeZone: "UTC",
        dateStyle: "short",
        timeStyle: "short",
      }) + " UTC"
    : "Non disponible";
export const integer = (v?: number | null) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : new Intl.NumberFormat("fr-FR").format(v);
export const statusLabels: Record<string, string> = {
  PENDING: "En attente",
  STOCK_RESERVED: "Stock réservé",
  PAID: "Confirmée",
  SHIPPED: "Expédiée",
  DELIVERED: "Livrée",
  CANCELLED: "Annulée",
  PAYMENT_FAILED: "Paiement refusé",
  REFUNDED: "Remboursée",
  SUCCEEDED: "Réussi",
  FAILED: "Échoué",
  ACTIVE: "Active",
  ACKNOWLEDGED: "Acquittée",
  RESOLVED: "Résolue",
  LOW_STOCK: "Stock faible",
  PAYMENT_FAILURE: "Échec de paiement",
  WAREHOUSE_SATURATION: "Entrepôt saturé",
  ORDER_SPIKE: "Pic de commandes",
};
export const terminal = new Set([
  "PAID",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "PAYMENT_FAILED",
  "REFUNDED",
]);
export const needsReview = (
  o: { status: string; created_at: string },
  now = Date.now(),
) => !terminal.has(o.status) && now - Date.parse(o.created_at) > 15 * 60_000;
export function metric(samples?: Sample[] | null, service?: string) {
  const row = samples?.find(
    (s) =>
      !service || s.metric.service === service || s.metric.instance === service,
  );
  if (!row) return undefined;
  const n = Number(row.value[1]);
  return Number.isFinite(n) ? n : undefined;
}
