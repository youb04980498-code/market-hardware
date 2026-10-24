import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Box,
  Pause,
  Play,
  RotateCcw,
  RefreshCw,
  ArrowUpRight,
  Search,
  Plus,
  Minus,
  PanelRightOpen,
  X,
  Map,
  Store,
  Warehouse as WarehouseIcon,
  Truck,
  ShoppingBag,
  Building2,
} from "lucide-react";
import { request } from "../api/client";
import { SceneBoundary } from "./StorePrototype";
import { useWorld } from "./useWorld";
import { warehouseSites } from "./cityLayout";
import type { CampusFocus, CampusZone, CampusSelection } from "./CampusScene";
import { departments, shoppers } from "./simulation";
import { stageColors } from "./worldModel";
import type {
  WorldStock,
  OrderDetail,
  Source,
  WorldMonitoring,
} from "./worldModel";
import "./campus.css";
const CampusScene = lazy(() => import("./CampusScene"));
const money = (value: number, currency = "EUR") =>
  new Intl.NumberFormat("en", { style: "currency", currency }).format(
    value / 100,
  );
const destinations = [
  { id: "overview", name: "Campus", icon: Map },
  { id: "storefront", name: "Store", icon: Store },
  { id: "checkout", name: "Checkout", icon: ShoppingBag },
  { id: "warehouses", name: "Warehouses", icon: WarehouseIcon },
  { id: "fulfillment", name: "Fulfillment", icon: Truck },
  { id: "business", name: "Business", icon: Building2 },
] as const;
type StockPage = {
  items: WorldStock[];
  total: number;
  page: number;
  page_size: number;
};
type StockRead = {
  data: StockPage | null;
  error: string;
  observed_at?: string;
};

export default function WorldExplorer() {
  const { snapshot, error, connection, stream, refresh } = useWorld();
  const [params, setParams] = useSearchParams();
  const zone = params.get("view") ?? "overview";
  const parsedZone: CampusZone = [
    "overview",
    "storefront",
    "checkout",
    "warehouses",
    "warehouse",
    "fulfillment",
    "business",
  ].includes(zone)
    ? (zone as CampusZone)
    : "overview";
  const initialId = Number(params.get("warehouse") ?? 0);
  const facilityParam = params.get("facility");
  const initialFacility =
    facilityParam === "headquarters" ||
    facilityParam === "analytics" ||
    facilityParam === "monitoring"
      ? facilityParam
      : undefined;
  const [focus, setFocus] = useState<CampusFocus>({
    zone: parsedZone,
    warehouseId: initialId || undefined,
    serial: 0,
    facility: initialFacility,
  });
  const [selected, setSelected] = useState<CampusSelection>(null);
  const [panel, setPanel] = useState(false),
    [demo, setDemo] = useState(false);
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [includeTest, setIncludeTest] = useState(false);
  const [paused, setPaused] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [ready, setReady] = useState(false),
    [lost, setLost] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState({ serial: 0, factor: 1 });
  const [detail, setDetail] = useState<OrderDetail | null>(null),
    [detailError, setDetailError] = useState("");
  const [stockReads, setStockReads] = useState<Record<number, StockRead>>({});
  const [stockPage, setStockPage] = useState(1);
  const [monitoring, setMonitoring] = useState<WorldMonitoring | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      try {
        const result = await request<WorldMonitoring>("/api/world/monitoring", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        if (active) setMonitoring(result);
      } catch {
        if (active)
          setMonitoring({
            available: false,
            data: null,
            error: "MONITORING_UNAVAILABLE",
          });
      }
    }
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  const onReady = useCallback(() => setReady(true), []),
    onLost = useCallback(() => setLost(true), []);
  const move = useCallback(
    (next: CampusZone, id?: number, facility?: CampusFocus["facility"]) => {
      setSelected(null);
      setStockPage(1);
      setReady(false);
      setFocus((f) => ({
        zone: next,
        warehouseId: id,
        serial: f.serial + 1,
        facility,
      }));
      setParams({
        view: next,
        ...(id ? { warehouse: String(id) } : {}),
        ...(facility ? { facility } : {}),
      });
      setQuery("");
      setStatus("");
      if (next === "warehouses" || next === "warehouse" || next === "business")
        setPanel(true);
    },
    [setParams],
  );
  useEffect(() => {
    setFocus((f) =>
      f.zone === parsedZone &&
      f.warehouseId === (initialId || undefined) &&
      f.facility === initialFacility
        ? f
        : {
            zone: parsedZone,
            warehouseId: initialId || undefined,
            serial: f.serial + 1,
            facility: initialFacility,
          },
    );
  }, [parsedZone, initialId, initialFacility]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => {
      if (media.matches) setPaused(true);
    };
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  const allWarehouses = snapshot?.warehouses.data?.items ?? [];
  const selectedWarehouseId =
    selected?.kind === "product" || selected?.kind === "rack"
      ? selected.warehouse_id
      : selected?.kind === "warehouse"
        ? selected.id
        : focus.warehouseId;
  const sites = warehouseSites(allWarehouses, selectedWarehouseId);
  const siteKey = sites.map((s) => s.warehouse.warehouse_id).join(",");
  useEffect(() => {
    if (!siteKey) return;
    let active = true;
    const controller = new AbortController();
    const ids = siteKey.split(",").map(Number);
    void Promise.all(
      ids.map(async (id) => {
        try {
          const page = id === selectedWarehouseId ? stockPage : 1;
          const r = await request<Source<StockPage>>(
            `/api/world/warehouses/${id}/stock?page=${page}`,
            {
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(15000),
              ]),
            },
          );
          if (active)
            setStockReads((old) => ({
              ...old,
              [id]: { data: r.data, error: "", observed_at: r.observed_at },
            }));
        } catch {
          if (active)
            setStockReads((old) => ({
              ...old,
              [id]: {
                data: old[id]?.data ?? null,
                error:
                  "Stock source unavailable; retained quantities may be stale.",
                observed_at: old[id]?.observed_at,
              },
            }));
        }
      }),
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [siteKey, selectedWarehouseId, stockPage, snapshot?.observed_at]);
  useEffect(() => {
    if (selected?.kind !== "order") {
      setDetail(null);
      setDetailError("");
      return;
    }
    let active = true;
    const controller = new AbortController();
    setDetail(null);
    setDetailError("");
    void request<OrderDetail>(`/api/world/orders/${selected.id}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then((r) => {
        if (active) setDetail(r);
      })
      .catch(() => {
        if (active) setDetailError("Order detail unavailable.");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selected?.kind, selected?.id, snapshot?.observed_at]);
  const products = snapshot?.catalog.data?.data.products.items ?? [];
  const rawOrders = snapshot?.orders.data?.items ?? [];
  const orders = detail
    ? [detail, ...rawOrders.filter((o) => o.order_id !== detail.order_id)]
    : rawOrders;
  const stocks = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(stockReads).map(([id, r]) => [id, r.data?.items ?? []]),
      ),
    [stockReads],
  );
  const warehouses = allWarehouses.filter(
    (w) =>
      (includeTest || w.classification === "OPERATIONAL") &&
      `${w.warehouse_id} ${w.name} ${w.city}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const filteredOrders = orders.filter(
    (o) =>
      (!status || o.status === status) &&
      `${o.order_id} ${o.status}`.toLowerCase().includes(query.toLowerCase()),
  );
  const currentWarehouse = allWarehouses.find(
    (w) => w.warehouse_id === selectedWarehouseId,
  );
  const currentStock = selectedWarehouseId
    ? stockReads[selectedWarehouseId]
    : undefined;
  const rows = (currentStock?.data?.items ?? []).filter((s) => {
    const p = products.find((p) => p.productId === String(s.product_id));
    return `${s.product_id} ${p?.name ?? ""} ${p?.sku ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase());
  });
  const selectedStock =
    selected?.kind === "product" && selected.warehouse_id
      ? stockReads[selected.warehouse_id]?.data?.items.find(
          (r) => r.product_id === selected.id,
        )
      : undefined;
  const selectedProduct =
    selected?.kind === "product"
      ? products.find((p) => p.productId === String(selected.id))
      : undefined;
  const selectedOrder =
    selected?.kind === "order"
      ? (detail ?? orders.find((o) => o.order_id === selected.id))
      : undefined;
  const department =
    selected?.kind === "department"
      ? departments.find((d) => d.id === selected.id)
      : undefined;
  const categoryMap: Record<string, string[]> = {
    gpu: ["GPU"],
    cpu: ["CPU"],
    ram: ["RAM"],
    board: ["MOTHERBOARD"],
    storage: ["SSD", "COOLER"],
    builds: ["CASE", "PSU"],
  };
  const categoryProducts = products.filter((p) =>
    categoryMap[department?.id ?? ""]?.includes(p.category),
  );
  const demoShopper =
    selected?.kind === "demo-customer"
      ? (shoppers.find((s) => s.id === selected.id) ??
        (selected.id.startsWith("demo-pedestrian")
          ? { name: "City pedestrian", activity: "Walking" }
          : undefined))
      : undefined;
  const payments =
    selected?.kind === "order"
      ? (snapshot?.payments.data?.items.filter(
          (p) => p.order_id === selected.id,
        ) ?? [])
      : [];
  const select = useCallback(
    (s: CampusSelection) => {
      if (s?.kind === "warehouse") {
        move("warehouse", s.id);
        setStockPage(1);
      }
      if (s?.kind === "facility") move("business", undefined, s.id);
      setSelected(s);
      if (s) setPanel(true);
    },
    [move],
  );
  const unavailable = snapshot
    ? (
        ["warehouses", "orders", "payments", "catalog", "analytics"] as const
      ).filter((k) => !snapshot[k].available)
    : [];
  const broker = (stream ?? snapshot?.stream)?.broker_connected;
  const stockErrors = sites.filter(
    (s) => stockReads[s.warehouse.warehouse_id]?.error,
  ).length;
  const orderMode = focus.zone === "checkout" || focus.zone === "fulfillment";
  const warehouseMode =
    focus.zone === "warehouses" || focus.zone === "warehouse";
  const retry = () => {
    setLost(false);
    setReady(false);
    setAttempt((n) => n + 1);
  };
  return (
    <div className="campus-app">
      <header className="campus-header">
        <Link
          to="/admin"
          className="campus-back"
          aria-label="Back to administration"
        >
          <ArrowLeft size={17} />
        </Link>
        <Link to="/admin" className="campus-brand">
          <Box size={22} />
          <span>
            MARKET HARDWARE<small>OPERATIONS CAMPUS</small>
          </span>
        </Link>
        <span className={`campus-mode ${demo ? "is-demo" : ""}`}>
          {demo ? "DEMO ACTIVITY" : "LIVE RECORDS"}
          <small>ONE CONNECTED WORLD</small>
        </span>
        <span data-testid="world-stream" className="campus-stream">
          <i className={connection === "connected" && broker ? "online" : ""} />
          {connection === "connected"
            ? broker
              ? "Kafka + SSE connected"
              : "Kafka disconnected · API reconciliation"
            : "Event stream disconnected · API reconciliation"}
        </span>
        <Link to="/admin" className="campus-admin-link">
          Administration <ArrowUpRight size={14} />
        </Link>
      </header>
      <main id="main" tabIndex={-1} className="campus-main">
        <div className="campus-canvas" key={attempt}>
          <SceneBoundary retry={retry}>
            <Suspense
              fallback={
                <div className="campus-loading" role="status">
                  Building the campus…
                </div>
              }
            >
              {lost ? (
                <div className="campus-loading" role="alert">
                  <h2>Graphics connection interrupted</h2>
                  <button onClick={retry}>Reload campus</button>
                </div>
              ) : (
                <CampusScene
                  focus={focus}
                  zoomCommand={zoom}
                  sites={sites}
                  stocks={stocks}
                  orders={orders}
                  products={products}
                  snapshot={snapshot}
                  monitoring={monitoring}
                  demo={demo}
                  paused={paused}
                  selected={selected}
                  onSelect={select}
                  onFocus={move}
                  onReady={onReady}
                  onLost={onLost}
                />
              )}
            </Suspense>
          </SceneBoundary>
        </div>
        <div className="campus-title">
          <span>MARKET HARDWARE / DIGITAL TWIN STUDY</span>
          <h1>One connected city.</h1>
          <p>
            Commercial. Industrial. Logistics. Business.
            <br />
            All on the same ground.
          </p>
        </div>
        <nav className="campus-focus" aria-label="Focus camera">
          <span>FOCUS</span>
          {destinations.map((d) => (
            <button
              key={d.id}
              onClick={() => move(d.id)}
              aria-pressed={
                focus.zone === d.id ||
                (d.id === "warehouses" && focus.zone === "warehouse")
              }
            >
              <d.icon size={16} />
              {d.name}
            </button>
          ))}
        </nav>
        <div className="campus-actions">
          <button onClick={refresh} aria-label="Refresh live world">
            <RefreshCw size={17} />
          </button>
          <button
            onClick={() => setPanel((v) => !v)}
            aria-expanded={panel}
            aria-label="Toggle record inspector"
          >
            <PanelRightOpen size={17} />
            <span>Records</span>
          </button>
        </div>
        <div className="campus-kpis">
          <div>
            <span>WAREHOUSES · INCL. TEST</span>
            <strong data-testid="warehouse-total">
              {snapshot?.warehouses.available ? allWarehouses.length : "—"}
            </strong>
          </div>
          <div>
            <span>RETAINED ORDERS</span>
            <strong data-testid="order-total">
              {snapshot?.orders.available ? snapshot.orders.data?.total : "—"}
            </strong>
          </div>
          <div>
            <span>PUBLISHED PRODUCTS</span>
            <strong>
              {snapshot?.catalog.available
                ? snapshot.catalog.data?.data.products.total
                : "—"}
            </strong>
          </div>
        </div>
        {(error || unavailable.length > 0 || stockErrors > 0) && (
          <div className="campus-notice" role="status">
            {error ||
              `Unavailable: ${unavailable.join(", ")}${stockErrors ? ` · ${stockErrors} stock sources` : ""}. Missing values are not zero.`}
          </div>
        )}
        {panel && (
          <aside
            className="campus-inspector"
            aria-label="Campus record inspector"
          >
            <div className="campus-panel-title">
              <span>RECORD INSPECTOR</span>
              <button
                onClick={() => setPanel(false)}
                aria-label="Close record inspector"
              >
                <X size={17} />
              </button>
            </div>
            <label className="campus-search">
              <Search size={15} />
              <input
                aria-label="Search world records"
                placeholder="Order, warehouse or product…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="campus-record-tabs">
              <button onClick={() => move("warehouses")}>Warehouses</button>
              <button onClick={() => move("fulfillment")}>Orders</button>
              <button onClick={() => move("storefront")}>Catalogue</button>
            </div>
            {focus.zone === "business" && (
              <div className="campus-records">
                {(["headquarters", "analytics", "monitoring"] as const).map(
                  (id) => (
                    <button
                      key={id}
                      onClick={() => select({ kind: "facility", id })}
                    >
                      <Building2 size={15} />
                      <span>
                        {id === "headquarters"
                          ? "Headquarters"
                          : id === "analytics"
                            ? "Analytics office"
                            : "Monitoring centre"}
                        <small>
                          Illustrative building · existing service reads
                        </small>
                      </span>
                    </button>
                  ),
                )}
              </div>
            )}
            {warehouseMode && (
              <>
                <label className="campus-check">
                  <input
                    type="checkbox"
                    checked={includeTest}
                    onChange={(e) => setIncludeTest(e.target.checked)}
                  />
                  Include TEST warehouses
                </label>
                {focus.zone === "warehouses" && (
                  <div className="campus-records">
                    {warehouses.map((w) => (
                      <button
                        key={w.warehouse_id}
                        onClick={() =>
                          select({ kind: "warehouse", id: w.warehouse_id })
                        }
                      >
                        <WarehouseIcon size={15} />
                        <span>
                          {w.name}
                          <small>
                            {w.city} · {w.classification} · #{w.warehouse_id}
                          </small>
                        </span>
                        <strong>{w.available}</strong>
                      </button>
                    ))}
                  </div>
                )}
                {focus.zone === "warehouse" && (
                  <>
                    <h2>
                      {currentWarehouse?.name ?? "Warehouse record unavailable"}
                    </h2>
                    <p className="campus-note">
                      {currentWarehouse?.city} ·{" "}
                      {currentWarehouse?.classification}. Synthetic rack
                      placements.
                    </p>
                    {currentStock?.error && (
                      <p role="alert" className="campus-note">
                        {currentStock.error}
                      </p>
                    )}
                    <div className="campus-pagination">
                      <button
                        disabled={stockPage === 1}
                        onClick={() => setStockPage((p) => p - 1)}
                      >
                        Previous
                      </button>
                      <span>Stock page {stockPage}</span>
                      <button
                        disabled={
                          !currentStock?.data ||
                          stockPage * 100 >= currentStock.data.total
                        }
                        onClick={() => setStockPage((p) => p + 1)}
                      >
                        Next
                      </button>
                    </div>
                    <div className="campus-records">
                      {rows.map((row) => (
                        <button
                          key={row.product_id}
                          onClick={() =>
                            select({
                              kind: "product",
                              id: row.product_id,
                              warehouse_id: selectedWarehouseId,
                            })
                          }
                        >
                          <Box size={15} />
                          <span>
                            {products.find(
                              (p) => p.productId === String(row.product_id),
                            )?.name ?? `Product ${row.product_id}`}
                            <small>
                              {row.available} available ·{" "}
                              {row.reserved_quantity} reserved
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                    {currentStock?.data && !rows.length && (
                      <p className="campus-note">No matching stock records.</p>
                    )}
                  </>
                )}
              </>
            )}
            {orderMode && (
              <>
                <label className="campus-status">
                  Recorded status
                  <select
                    aria-label="Filter order status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">All statuses</option>
                    {Object.keys(stageColors).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                {/^\d+$/.test(query) && Number.isSafeInteger(Number(query)) && (
                  <button
                    onClick={() => select({ kind: "order", id: Number(query) })}
                  >
                    Look up order #{query}
                  </button>
                )}
                <p className="campus-note">
                  Latest {rawOrders.length} of{" "}
                  {snapshot?.orders.data?.total ?? "—"} loaded; up to 24 parcels
                  / 8 order figures. Exact ID lookup can retrieve older orders.
                </p>
                <div className="campus-records">
                  {filteredOrders.map((o) => (
                    <button
                      key={o.order_id}
                      onClick={() => select({ kind: "order", id: o.order_id })}
                    >
                      <i
                        style={{
                          background: stageColors[o.status] ?? "#9a9c91",
                        }}
                      />
                      <span>
                        Order #{o.order_id}
                        <small>{o.status}</small>
                      </span>
                      <strong>{money(o.total_cents, o.currency)}</strong>
                    </button>
                  ))}
                </div>
              </>
            )}
            {focus.zone === "storefront" && (
              <>
                <p className="campus-note">
                  {snapshot?.catalog.data?.data.products.total ?? "—"} published
                  products. Display coordinates are illustrative; live carts are
                  unavailable without telemetry.
                </p>
                <div className="campus-records">
                  {products
                    .filter((p) =>
                      `${p.name} ${p.sku} ${p.productId}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((p) => (
                      <button
                        key={p.productId}
                        onClick={() =>
                          select({ kind: "product", id: Number(p.productId) })
                        }
                      >
                        <Box size={15} />
                        <span>
                          {p.name}
                          <small>
                            {p.sku} · {p.category}
                          </small>
                        </span>
                      </button>
                    ))}
                </div>
              </>
            )}
            <section className="campus-detail" aria-live="polite">
              <h2>
                {selected?.kind === "facility"
                  ? selected.id === "headquarters"
                    ? "Headquarters"
                    : selected.id === "analytics"
                      ? "Analytics office"
                      : "Monitoring centre"
                  : selectedOrder
                    ? `Order #${selectedOrder.order_id}`
                    : selectedStock
                      ? (selectedProduct?.name ??
                        `Product ${selectedStock.product_id}`)
                      : (selectedProduct?.name ??
                        department?.name ??
                        (demoShopper
                          ? `DEMO / ${demoShopper.name}`
                          : selected?.kind === "rack"
                            ? `Rack ${selected.id + 1} / synthetic`
                            : "Select a building or record"))}
              </h2>
              {selected?.kind === "facility" ? (
                <>
                  <p className="campus-note">
                    An illustrative Business district interior. This building
                    does not imply a real office location or physical telemetry.
                  </p>
                  {selected.id === "headquarters" ? (
                    <>
                      <p>
                        Retained orders:{" "}
                        {snapshot?.orders.available
                          ? snapshot.orders.data?.total
                          : "Unavailable"}
                      </p>
                      <p>
                        Published products:{" "}
                        {snapshot?.catalog.available
                          ? snapshot.catalog.data?.data.products.total
                          : "Unavailable"}
                      </p>
                      <Link to="/admin">Open existing administration</Link>
                    </>
                  ) : selected.id === "analytics" ? (
                    <>
                      <p>
                        Net revenue:{" "}
                        {snapshot?.analytics.available &&
                        snapshot.analytics.data
                          ? money(snapshot.analytics.data.data.net_cents)
                          : "Unavailable"}
                      </p>
                      <p className="campus-note">
                        {snapshot?.analytics.data?.metadata.stale
                          ? "STALE analytics snapshot."
                          : "Read from the existing Analytics API; no new computation."}
                      </p>
                      <Link to="/admin/analytics">Open existing analytics</Link>
                    </>
                  ) : (
                    <>
                      <p>
                        {monitoring?.available
                          ? "Observability API connected"
                          : "Monitoring unavailable"}
                      </p>
                      <p className="campus-note">
                        {monitoring?.data?.unavailable.length
                          ? `Missing sources: ${monitoring.data.unavailable.join(", ")}`
                          : "Monitoring availability is independent of Kafka and the business API connections."}
                      </p>
                      <Link to="/admin/observability">
                        Open existing observability
                      </Link>
                    </>
                  )}
                </>
              ) : selectedOrder ? (
                <>
                  <p>
                    <strong>{selectedOrder.status}</strong> ·{" "}
                    {money(selectedOrder.total_cents, selectedOrder.currency)}
                  </p>
                  <p className="campus-note">
                    An anonymous order token, not a tracked person. Movement
                    only illustrates the recorded state.
                  </p>
                  {detailError ? (
                    <p role="alert">{detailError}</p>
                  ) : !detail ? (
                    <p role="status">Loading order detail…</p>
                  ) : (
                    <ul>
                      {detail.items.map((line, i) => (
                        <li key={i}>
                          {line.product_name ??
                            line.sku ??
                            `Product ${line.product_id}`}{" "}
                          × {line.quantity}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="campus-note">
                    Payment:{" "}
                    {(detail?.payments.data?.items ?? payments)
                      .map(
                        (p) =>
                          `${p.status} / ${money(p.amount_cents, p.currency)}`,
                      )
                      .join(", ") ||
                      (detail?.payments.available ||
                      snapshot?.payments.available
                        ? "No payment recorded"
                        : "Unavailable")}
                    . Provider simulated.
                  </p>
                  <Link to={`/admin/orders/${selectedOrder.order_id}`}>
                    Open existing order administration{" "}
                    <ArrowUpRight size={13} />
                  </Link>
                </>
              ) : selectedStock ? (
                <>
                  <dl>
                    <dt>Physical quantity</dt>
                    <dd>{selectedStock.quantity}</dd>
                    <dt>Reserved</dt>
                    <dd>{selectedStock.reserved_quantity}</dd>
                    <dt>Available</dt>
                    <dd>{selectedStock.available}</dd>
                  </dl>
                  <p className="campus-note">
                    Inventory API quantities. The rack location is synthetic.
                  </p>
                  <Link to="/admin/inventory">
                    Open inventory administration
                  </Link>
                  <Link to={`/products/${selectedStock.product_id}`}>
                    Open catalogue product
                  </Link>
                </>
              ) : selectedProduct ? (
                <>
                  <p>
                    {selectedProduct.sku} · {selectedProduct.category}
                  </p>
                  <p className="campus-note">
                    Published catalogue record. Select a warehouse for current
                    stock.
                  </p>
                  <Link to={`/products/${selectedProduct.productId}`}>
                    Open catalogue product
                  </Link>
                </>
              ) : department ? (
                <>
                  <p className="campus-note">
                    {categoryProducts.length} matching products in the loaded
                    catalogue.
                  </p>
                  {categoryProducts.slice(0, 8).map((p) => (
                    <button
                      key={p.productId}
                      onClick={() =>
                        select({ kind: "product", id: Number(p.productId) })
                      }
                    >
                      {p.name}
                    </button>
                  ))}
                </>
              ) : demoShopper ? (
                <p className="campus-note">
                  {demoShopper.activity} · Explicitly simulated. This does not
                  represent a website visitor, cart session or actual order.
                </p>
              ) : selected?.kind === "rack" ? (
                <>
                  {(
                    currentStock?.data?.items.slice(
                      selected.id * 4,
                      selected.id * 4 + 4,
                    ) ?? []
                  ).map((row) => (
                    <button
                      key={row.product_id}
                      onClick={() =>
                        select({
                          kind: "product",
                          id: row.product_id,
                          warehouse_id: selectedWarehouseId,
                        })
                      }
                    >
                      Product {row.product_id}: {row.available} available
                    </button>
                  ))}
                </>
              ) : (
                <p className="campus-note">
                  Click a facility, product, rack, parcel or order figure. Every
                  facility stays on the same ground plane; the focus controls
                  only move your camera.
                </p>
              )}
            </section>
            {snapshot?.analytics.data && (
              <p className="campus-note">
                Analytics net revenue:{" "}
                {money(snapshot.analytics.data.data.net_cents)}{" "}
                {snapshot.analytics.data.metadata.stale ? "· STALE" : ""}
                <br />
                Snapshot{" "}
                {new Date(
                  snapshot.analytics.data.metadata.snapshot_at,
                ).toLocaleString()}
              </p>
            )}
          </aside>
        )}
        <div className="campus-bottom">
          <div className="campus-status-line">
            <i className={ready ? "is-ready" : ""} />
            <span role="status">
              {ready ? "Campus ready" : "Positioning camera…"}
            </span>
            <span>
              {snapshot
                ? `Observed ${new Date(snapshot.observed_at).toLocaleTimeString()}`
                : "Loading APIs…"}
            </span>
          </div>
          <div
            className="campus-controls"
            role="group"
            aria-label="Campus controls"
          >
            <button
              onClick={() => setPaused((v) => !v)}
              aria-label={
                paused ? "Resume world animations" : "Pause world animations"
              }
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}{" "}
              {paused ? "Resume" : "Pause"}
            </button>
            <span />
            <button
              onClick={() => move("overview")}
              aria-label="Reset campus camera"
            >
              <RotateCcw size={16} />
              Whole campus
            </button>
            <button
              onClick={() =>
                setZoom((z) => ({ serial: z.serial + 1, factor: 1.25 }))
              }
              aria-label="Zoom in"
            >
              <Plus size={17} />
            </button>
            <button
              onClick={() =>
                setZoom((z) => ({ serial: z.serial + 1, factor: 0.8 }))
              }
              aria-label="Zoom out"
            >
              <Minus size={17} />
            </button>
          </div>
          <button
            className={`campus-demo-toggle ${demo ? "active" : ""}`}
            aria-pressed={demo}
            onClick={() => setDemo((v) => !v)}
          >
            {demo ? "DEMO ACTIVITY ON" : "Add DEMO activity"}
          </button>
        </div>
        <div className="campus-legend">
          <span>DRAG TO ORBIT · RIGHT-DRAG TO PAN · SCROLL TO ZOOM</span>
          <span>
            {demo
              ? "DEMO people, carts & delivery vans · business labels still use API records"
              : "No live cart telemetry · figures represent recorded orders"}{" "}
            · Layout and movement illustrative, not physical tracking.
          </span>
        </div>
      </main>
    </div>
  );
}
