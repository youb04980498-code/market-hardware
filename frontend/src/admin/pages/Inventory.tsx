import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Search } from "lucide-react";
import {
  allProducts,
  warehouseList,
  stockSnapshot,
  incidents,
  integer,
  type Warehouse,
} from "../data";
import { labels } from "../../api/market";
import { useAdminResource } from "../useAdminResource";
import {
  PageHeader,
  Kpi,
  Panel,
  Freshness,
  Refresh,
  ResourceState,
  Drawer,
  Fact,
  Badge,
  Tabs,
  Pagination,
  ShareList,
} from "../components";
import Alerts from "../Alerts";
export default function Inventory() {
  const [params] = useSearchParams();
  const [includeTest, setIncludeTest] = useState(false),
    [tab, setTab] = useState("risks"),
    [search, setSearch] = useState(params.get("product") || ""),
    [wid, setWid] = useState(params.get("warehouse") || ""),
    [selected, setSelected] = useState<Warehouse>(),
    [page, setPage] = useState(1);
  const stocks = useAdminResource(stockSnapshot, "inventory-snapshot");
  const metadata = useAdminResource(warehouseList, "warehouse-summary");
  const catalog = useAdminResource(allProducts, "inventory-products");
  const alerts = useAdminResource(() => incidents(), "inventory-alerts");
  const ws =
    metadata.data?.items.filter(
      (w) => includeTest || w.classification === "OPERATIONAL",
    ) || [];
  const productMap = new Map(
    catalog.data?.map((p) => [Number(p.productId), p]),
  );
  const rows =
    stocks.data?.data.items.filter(
      (r) =>
        ws.some((w) => w.warehouse_id === r.warehouse_id) &&
        (!wid || r.warehouse_id === Number(wid)),
    ) || [];
  const productTotals = new Map<number, number>();
  rows.forEach((r) =>
    productTotals.set(
      r.product_id,
      (productTotals.get(r.product_id) || 0) + r.available,
    ),
  );
  const threshold = stocks.data?.data.threshold ?? 5;
  const filtered = rows
    .filter(
      (r) =>
        !search ||
        `${r.product_id} ${productMap.get(r.product_id)?.name || ""} ${productMap.get(r.product_id)?.sku || ""} ${r.warehouse}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .filter((r) => tab !== "risks" || r.available <= threshold)
    .sort((a, b) => a.available - b.available);
  const sums = ws.reduce(
    (a, w) => ({
      physical: a.physical + Number(w.physical),
      available: a.available + Number(w.available),
    }),
    { physical: 0, available: 0 },
  );
  const selectedRows =
    stocks.data?.data.items.filter(
      (r) => r.warehouse_id === selected?.warehouse_id,
    ) || [];
  function active(w: number) {
    return (
      alerts.data?.items.filter(
        (a) =>
          a.status !== "RESOLVED" &&
          ((a.type === "WAREHOUSE_SATURATION" &&
            a.entity_reference === String(w)) ||
            a.details.warehouse_id === w),
      ) || []
    );
  }
  return (
    <div className="admin-page">
      <PageHeader
        tag="WAREHOUSE CONTROL / LOGISTIQUE"
        title="Inventaire"
        subtitle="Pilotez vos stocks et entrepôts."
      >
        <Refresh
          loading={stocks.loading || metadata.loading}
          onClick={() => {
            stocks.retry();
            metadata.retry();
            alerts.retry();
          }}
        />
      </PageHeader>
      <Freshness
        meta={stocks.data?.metadata}
        at={stocks.at}
        error={stocks.error || metadata.error}
      />
      <ResourceState {...metadata} />
      <ResourceState {...stocks} />
      <div className="kpi-strip">
        <Kpi
          label="Stock physique"
          value={metadata.data && integer(sums.physical)}
          note="Unités présentes · lecture Inventory actuelle"
        />
        <Kpi
          label="Stock disponible"
          value={metadata.data && integer(sums.available)}
          note="Physique moins réservé · lecture actuelle"
        />
        <Kpi
          label="Produits à stock faible"
          value={
            stocks.data &&
            metadata.data &&
            integer(
              [...productTotals.values()].filter((n) => n > 0 && n <= threshold)
                .length,
            )
          }
          note={`Disponibilité agrégée de 1 à ${threshold} · snapshot`}
        />
        <Kpi
          label="Produits en rupture"
          value={
            stocks.data &&
            metadata.data &&
            integer([...productTotals.values()].filter((n) => n === 0).length)
          }
          note="Stock agrégé nul · produits présents au snapshot"
        />
      </div>
      <Panel
        title="Capacité des entrepôts"
        description="Capacité physique en unités d’articles · normal < 75 %, vigilance 75–90 %, critique > 90 %"
        action={
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={includeTest}
              onChange={(e) => {
                setIncludeTest(e.target.checked);
                setPage(1);
              }}
            />
            Inclure les entrepôts de test et archivés
          </label>
        }
      >
        <div className="warehouse-grid">
          {ws.map((w) => {
            const u =
              w.utilization_percent == null
                ? null
                : Number(w.utilization_percent);
            const status =
              u == null
                ? "Non mesuré"
                : u > 90
                  ? "Critique"
                  : u >= 75
                    ? "Vigilance"
                    : "Normal";
            return (
              <article
                className={
                  "warehouse-card " +
                  (u != null && u > 90
                    ? "critical"
                    : u != null && u >= 75
                      ? "warning"
                      : "")
                }
                key={w.warehouse_id}
              >
                <header>
                  <div>
                    <h3>{w.name}</h3>
                    <p>
                      {w.city} · {w.classification}
                    </p>
                  </div>
                  <Badge
                    value={status}
                    tone={
                      u == null
                        ? "neutral"
                        : u > 90
                          ? "bad"
                          : u >= 75
                            ? "warn"
                            : "good"
                    }
                  />
                </header>
                <div>
                  <div className="capacity-value">
                    <strong>
                      {u == null
                        ? "—"
                        : u.toLocaleString("fr-FR", {
                            maximumFractionDigits: 1,
                          }) + " %"}
                    </strong>
                    <span>de capacité occupée</span>
                  </div>
                  <div className="capacity-track">
                    <i style={{ width: `${Math.min(100, u || 0)}%` }} />
                  </div>
                </div>
                <div className="warehouse-numbers">
                  <div>
                    Physique<strong>{integer(Number(w.physical))}</strong>
                  </div>
                  <div>
                    Réservé<strong>{integer(Number(w.reserved))}</strong>
                  </div>
                  <div>
                    Disponible<strong>{integer(Number(w.available))}</strong>
                  </div>
                </div>
                <footer>
                  <span>
                    {w.capacity_units > 0
                      ? integer(
                          Math.max(0, w.capacity_units - Number(w.physical)),
                        ) + " places libres"
                      : "Capacité inconnue"}{" "}
                    · {alerts.data ? active(w.warehouse_id).length : "—"}{" "}
                    alertes ·{" "}
                    {stocks.data
                      ? new Set(
                          stocks.data.data.items
                            .filter((r) => r.warehouse_id === w.warehouse_id)
                            .map((r) => r.product_id),
                        ).size
                      : "—"}{" "}
                    produits
                  </span>
                  <button onClick={() => setSelected(w)}>Examiner</button>
                </footer>
              </article>
            );
          })}
        </div>
        <ResourceState empty={!!metadata.data && !ws.length} />
        <p className="inline-note">
          Nombre de produits :{" "}
          {stocks.data
            ? integer(new Set(rows.map((r) => r.product_id)).size)
            : "Non disponible"}{" "}
          dans le périmètre du snapshot. L’occupation est physique / capacité,
          jamais disponible / capacité.
        </p>
      </Panel>
      <Tabs
        value={tab}
        onChange={(v) => {
          setTab(v);
          setPage(1);
        }}
        tabs={[
          { id: "risks", label: "Produits nécessitant une action" },
          { id: "stocks", label: "Stocks" },
          { id: "alerts", label: "Alertes" },
        ]}
      />
      {tab === "alerts" ? (
        <Alerts />
      ) : (
        <Panel
          title={
            tab === "risks"
              ? "Produits nécessitant une action"
              : "Stock par produit et entrepôt"
          }
          description="Priorité à la rupture, puis aux faibles disponibilités"
        >
          <div className="filterbar">
            <label className="search-field">
              Produit ou SKU
              <div>
                <Search size={14} />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Nom, SKU ou identifiant"
                />
              </div>
            </label>
            <label>
              Entrepôt
              <select
                value={wid}
                onChange={(e) => {
                  setWid(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tous les entrepôts affichés</option>
                {ws.map((w) => (
                  <option key={w.warehouse_id} value={w.warehouse_id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="inline-note">
            Snapshot au{" "}
            {stocks.data?.metadata.snapshot_at
              ? new Date(stocks.data.metadata.snapshot_at).toLocaleString(
                  "fr-FR",
                )
              : "—"}{" "}
            · mouvements historiques non exposés.
          </div>
          <div className="command-table">
            <table>
              <thead>
                <tr>
                  {[
                    "Produit / SKU",
                    "Entrepôt",
                    "Physique",
                    "Réservé",
                    "Disponible",
                    "Seuil",
                    "Sévérité",
                    "Action",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice((page - 1) * 10, page * 10).map((r) => (
                  <tr key={r.product_id + ":" + r.warehouse_id}>
                    <td>
                      <strong>
                        {productMap.get(r.product_id)?.name ||
                          "#" + r.product_id}
                      </strong>
                      <small>
                        {productMap.get(r.product_id)?.sku || "SKU non publié"}
                      </small>
                    </td>
                    <td>{r.warehouse}</td>
                    <td className="numeric">{r.quantity}</td>
                    <td className="numeric">{r.reserved_quantity}</td>
                    <td className="numeric">{r.available}</td>
                    <td className="numeric">{threshold}</td>
                    <td>
                      <Badge
                        value={
                          r.available === 0
                            ? "Rupture"
                            : r.available <= threshold
                              ? "Faible"
                              : "Disponible"
                        }
                        tone={
                          r.available === 0
                            ? "bad"
                            : r.available <= threshold
                              ? "warn"
                              : "good"
                        }
                      />
                    </td>
                    <td>
                      <button
                        onClick={() =>
                          setSelected(
                            ws.find((w) => w.warehouse_id === r.warehouse_id),
                          )
                        }
                      >
                        Localiser
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ResourceState empty={!!stocks.data && !filtered.length} />
          <Pagination page={page} total={filtered.length} onChange={setPage} />
        </Panel>
      )}
      {selected && (
        <Drawer
          title={selected.name}
          subtitle={selected.city + " · " + selected.classification}
          onClose={() => setSelected(undefined)}
        >
          <div>
            <Fact
              label="Capacité physique"
              value={
                selected.capacity_units > 0
                  ? integer(selected.capacity_units) + " unités"
                  : "Non disponible"
              }
            />
            <Fact
              label="Utilisation"
              value={
                selected.utilization_percent == null
                  ? "Non disponible"
                  : selected.utilization_percent + " %"
              }
            />
            <Fact
              label="Stock physique"
              value={integer(Number(selected.physical))}
            />
            <Fact label="Réservé" value={integer(Number(selected.reserved))} />
            <Fact
              label="Disponible"
              value={integer(Number(selected.available))}
            />
            <Fact
              label="Produits au snapshot"
              value={integer(selectedRows.length)}
            />
          </div>
          <div className="drawer-section">
            <h3>Répartition des produits au snapshot</h3>
            <ShareList
              rows={selectedRows
                .slice()
                .sort((a, b) => b.quantity - a.quantity)
                .slice(0, 8)
                .map((r) => ({
                  label:
                    productMap.get(r.product_id)?.name || "#" + r.product_id,
                  value: r.quantity,
                }))}
              format={(v) => integer(v) + " unités"}
            />
            <p>
              Huit stocks physiques les plus importants ; parts de cette
              sélection.
            </p>
          </div>
          <div className="drawer-section">
            <h3>Alertes actives</h3>
            {active(selected.warehouse_id).map((a) => (
              <Fact
                key={a.alert_id}
                label={a.type}
                value={<Badge value={a.status} />}
              />
            ))}
            {!active(selected.warehouse_id).length && (
              <p>Aucune alerte non résolue dans la réponse actuelle.</p>
            )}
          </div>
          <div className="drawer-section">
            <h3>Mouvements de stock</h3>
            <p>
              L’historique des mouvements n’est pas exposé par l’API actuelle.
              Aucun mouvement n’est déduit d’une différence de snapshots.
            </p>
            <Link to="/admin/observability">
              Examiner les alertes et la supervision
            </Link>
          </div>
        </Drawer>
      )}
      <p className="inline-note">
        Les mutations de stock restent protégées par l’API. Le catalogue publié
        compte {catalog.data?.length ?? "—"} produits ; catégories :{" "}
        {catalog.data
          ? [
              ...new Set(
                catalog.data.map((p) => labels[p.category] || p.category),
              ),
            ].join(", ")
          : "Non disponibles"}
        .
      </p>
    </div>
  );
}
