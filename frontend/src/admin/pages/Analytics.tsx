import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download } from "lucide-react";
import { money } from "../../shared/utils";
import { labels } from "../../api/market";
import {
  business,
  stockSnapshot,
  warehouseList,
  integer,
  dateTime,
} from "../data";
import { useAdminResource } from "../useAdminResource";
import {
  PageHeader,
  Kpi,
  Panel,
  DateRange,
  Refresh,
  Freshness,
  ResourceState,
  Tabs,
  Pagination,
  ShareList,
  Badge,
  Fact,
  periodQuery,
  type Range,
} from "../components";
import { RevenueChart, OrdersChart } from "../charts";
export default function Analytics() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") || "overview"),
    [range, setRange] = useState<Range>({ from: "", to: "" }),
    [granularity, setGranularity] = useState("month"),
    [quarter, setQuarter] = useState(""),
    [metric, setMetric] = useState<
      "net_cents" | "gross_cents" | "refunded_cents"
    >("net_cents"),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(1),
    [warehouse, setWarehouse] = useState(""),
    [low, setLow] = useState(false),
    [stockPage, setStockPage] = useState(1),
    [auto, setAuto] = useState(false);
  const period = periodQuery(range);
  const resource = useAdminResource(
    () => business(period, granularity),
    period + ":" + granularity,
    auto ? 30000 : 0,
  );
  const inventory = useAdminResource(
    async () => ({
      stock: await stockSnapshot(),
      warehouses: await warehouseList(),
    }),
    "analytics-inventory",
  );
  const d = resource.data,
    k = d?.overview;
  const cats =
    d?.categories.slice().sort((a, b) => b.net_cents - a.net_cents) || [];
  const top =
    d?.products.slice().sort((a, b) => b.net_cents - a.net_cents) || [];
  const products = (d?.products || []).filter(
    (p) => !category || p.category === category,
  );
  const warehouses =
    inventory.data?.warehouses.items.filter(
      (w) => w.classification === "OPERATIONAL",
    ) || [];
  const stock =
    inventory.data?.stock.data.items.filter(
      (r) =>
        warehouses.some((w) => w.warehouse_id === r.warehouse_id) &&
        (!warehouse || r.warehouse_id === Number(warehouse)) &&
        (!low || r.available <= (inventory.data?.stock.data.threshold ?? 5)),
    ) || [];
  function setPeriod(r: Range) {
    setRange(r);
    setQuarter("");
    setPage(1);
  }
  function exportCsv() {
    if (!d) return;
    const rows = [
      ["periode", "brut_centimes", "rembourse_centimes", "net_centimes"],
      ...d.revenue.map((r) => [
        r.period,
        r.gross_cents,
        r.refunded_cents,
        r.net_cents,
      ]),
    ];
    const csv = rows
      .map((r) =>
        r.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(";"),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "market-revenue-" + d.metadata.release_id.slice(0, 8) + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="admin-page analytics-command">
      <PageHeader
        tag="BUSINESS INTELLIGENCE / FINANCES"
        title="Analytics"
        subtitle="Analysez les performances de votre activité."
      >
        <DateRange value={range} onChange={setPeriod} />
        <button className="admin-button" disabled={!d} onClick={exportCsv}>
          <Download size={14} />
          Exporter CSV
        </button>
        <Refresh loading={resource.loading} onClick={resource.retry} />
      </PageHeader>
      <Freshness meta={d?.metadata} at={resource.at} error={resource.error} />
      <ResourceState {...resource} />
      <div className="filterbar">
        <label>
          Trimestre
          <select
            aria-label="Trimestre"
            value={quarter}
            onChange={(e) => {
              const value = e.target.value;
              setQuarter(value);
              setPage(1);
              if (!value) {
                setRange({ from: "", to: "" });
                return;
              }
              const [y, q] = value.split("-Q").map(Number);
              setRange({
                from: new Date(Date.UTC(y, (q - 1) * 3, 1))
                  .toISOString()
                  .slice(0, 10),
                to: new Date(Date.UTC(y, q * 3, 1)).toISOString().slice(0, 10),
              });
            }}
          >
            <option value="">Toutes les dates / plage libre</option>
            {d?.quarters.map((q) => (
              <option key={q.period}>{q.period}</option>
            ))}
          </select>
        </label>
        <label>
          Regroupement
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value)}
          >
            <option value="day">Jour</option>
            <option value="month">Mois</option>
            <option value="quarter">Trimestre</option>
          </select>
        </label>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          Actualiser toutes les 30 s
        </label>
        <span className="inline-note">
          Cohortes UTC des paiements · EUR · activité de vérification incluse
        </span>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        label="Navigation Analytics"
        tabs={[
          { id: "overview", label: "Vue générale" },
          { id: "sales", label: "Ventes" },
          { id: "products", label: "Produits" },
          { id: "customers", label: "Clients" },
          { id: "warehouses", label: "Entrepôts" },
          { id: "reports", label: "Rapports" },
        ]}
      />
      <div className="kpi-strip">
        <Kpi
          label="Chiffre d’affaires brut"
          value={k && money(k.gross_cents)}
          note="Captures réussies uniquement"
        />
        <Kpi
          label="Remboursements"
          value={k && money(k.refunded_cents)}
          note="Succès connus · cohorte du paiement initial"
        />
        <Kpi
          label="Chiffre d’affaires net"
          value={k && money(k.net_cents)}
          note="Brut capturé moins remboursements"
        />
        <Kpi
          label="Panier moyen"
          value={k && money(k.aov_cents)}
          note="Brut / commandes capturées · arrondi serveur"
        />
      </div>
      {["overview", "sales"].includes(tab) && (
        <>
          <Panel
            title="Évolution du chiffre d’affaires"
            description="Les remboursements tardifs corrigent la cohorte d’origine"
            action={
              <select
                aria-label="Mesure du graphique"
                value={metric}
                onChange={(e) => setMetric(e.target.value as typeof metric)}
              >
                <option value="net_cents">CA net</option>
                <option value="gross_cents">CA brut</option>
                <option value="refunded_cents">Remboursements</option>
              </select>
            }
          >
            {d?.revenue.length ? (
              <RevenueChart rows={d.revenue} metric={metric} />
            ) : (
              <ResourceState
                empty={!resource.loading}
                loading={resource.loading}
              />
            )}
          </Panel>
          {d && (
            <div className="insights-line">
              {cats.length > 0 && (
                <span>
                  Première catégorie :{" "}
                  <strong>
                    {labels[cats[0].category] || cats[0].category}
                  </strong>{" "}
                  · {money(cats[0].net_cents)}
                </span>
              )}
              {top.length > 0 && (
                <span>
                  Produit au plus fort CA net : <strong>{top[0].name}</strong>
                </span>
              )}
              {k && k.gross_cents > 0 && (
                <span>
                  Part remboursée :{" "}
                  <strong>
                    {((k.refunded_cents / k.gross_cents) * 100).toLocaleString(
                      "fr-FR",
                      { maximumFractionDigits: 1 },
                    )}{" "}
                    %
                  </strong>{" "}
                  du brut
                </span>
              )}
            </div>
          )}
          <div className="command-grid equal">
            <Panel
              title="Répartition par catégorie"
              description="CA net · parts du total de la période"
            >
              <ShareList
                rows={cats.map((c) => ({
                  label: labels[c.category] || c.category,
                  value: c.net_cents,
                  id: c.category,
                }))}
                format={money}
                onSelect={(id) => {
                  setCategory(id);
                  setTab("products");
                  setPage(1);
                }}
              />
              <ResourceState empty={!!d && !cats.length} />
            </Panel>
            <Panel
              title="Produits les plus performants"
              description="Huit premiers par CA net · contribution dans cette sélection"
            >
              <ShareList
                rows={top.slice(0, 8).map((p) => ({
                  label: p.name,
                  value: p.net_cents,
                  id: String(p.product_id),
                }))}
                format={money}
                onSelect={() => {
                  setTab("products");
                  setCategory("");
                }}
              />
              <ResourceState empty={!!d && !top.length} />
            </Panel>
          </div>
          {tab === "sales" && (
            <div className="command-grid equal">
              <Panel
                title="Commandes par jour"
                description="Nombre de commandes · dates de création UTC"
              >
                {d && (
                  <OrdersChart
                    rows={d.daily.map((r) => ({
                      label: r.date,
                      count: r.order_count,
                    }))}
                  />
                )}
              </Panel>
              <Panel
                title="Répartition des statuts"
                description="État connu au dernier snapshot"
              >
                <ShareList
                  rows={
                    d?.statuses.map((s) => ({
                      label: s.status,
                      value: s.order_count,
                    })) || []
                  }
                  format={integer}
                />
              </Panel>
            </div>
          )}
        </>
      )}
      {tab === "products" && (
        <Panel
          title="Produits et catégories"
          description="Unités vendues brutes · prix d’achat figés · catégorie publiée actuelle"
        >
          <div className="filterbar">
            <label>
              Catégorie
              <select
                aria-label="Catégorie"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Toutes</option>
                {d?.categories.map((c) => (
                  <option key={c.category} value={c.category}>
                    {labels[c.category] || c.category}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="inline-note">
            Un remboursement ne prouve pas un retour physique. Contribution = CA
            net du produit / CA net de la période.
          </div>
          <div className="command-table">
            <table>
              <thead>
                <tr>
                  {[
                    "Produit",
                    "Catégorie",
                    "Unités",
                    "CA brut",
                    "Remboursé",
                    "CA net",
                    "Contribution",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.slice((page - 1) * 10, page * 10).map((p) => (
                  <tr key={p.product_id}>
                    <td>
                      <strong>{p.name}</strong>
                      <small>#{p.product_id}</small>
                    </td>
                    <td>{labels[p.category] || p.category}</td>
                    <td className="numeric">{integer(p.units_sold)}</td>
                    <td className="numeric">{money(p.gross_cents)}</td>
                    <td className="numeric">{money(p.refunded_cents)}</td>
                    <td className="numeric">{money(p.net_cents)}</td>
                    <td className="numeric">
                      {k && k.net_cents > 0
                        ? ((p.net_cents / k.net_cents) * 100).toLocaleString(
                            "fr-FR",
                            { maximumFractionDigits: 1 },
                          ) + " %"
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ResourceState empty={!!d && !products.length} />
          <Pagination page={page} total={products.length} onChange={setPage} />
        </Panel>
      )}
      {tab === "customers" && (
        <Panel
          title="Comprendre votre clientèle"
          description="Registre Orders · références pseudonymisées dans le lakehouse"
        >
          <div className="resource-mini">
            <div>
              <p>Clients enregistrés</p>
              <strong>{integer(k?.registered_customers)}</strong>
              <small>Registre Orders ; distinct des identités Auth</small>
            </div>
            <div>
              <p>Clients acheteurs</p>
              <strong>{integer(k?.purchasing_customers)}</strong>
              <small>Au moins une capture dans la période</small>
            </div>
            <div>
              <p>Clients récurrents</p>
              <strong>{integer(k?.repeat_customers)}</strong>
              <small>Définition calculée par le modèle Phase 6</small>
            </div>
            <div>
              <p>Sessions actives</p>
              <strong>—</strong>
              <small>Non exposées ; ne pas confondre avec les acheteurs</small>
            </div>
          </div>
        </Panel>
      )}
      {tab === "warehouses" && (
        <Panel
          title="Stock observé"
          description="Snapshot courant · indépendant de la période financière"
        >
          <Freshness
            meta={inventory.data?.stock.metadata}
            at={inventory.at}
            error={inventory.error}
          />
          <ResourceState {...inventory} />
          <div className="filterbar">
            <label>
              Entrepôt
              <select
                value={warehouse}
                onChange={(e) => {
                  setWarehouse(e.target.value);
                  setStockPage(1);
                }}
              >
                <option value="">Tous les entrepôts opérationnels</option>
                {warehouses.map((w) => (
                  <option value={w.warehouse_id} key={w.warehouse_id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={low}
                onChange={(e) => {
                  setLow(e.target.checked);
                  setStockPage(1);
                }}
              />
              Stock faible (≤ {inventory.data?.stock.data.threshold ?? 5})
            </label>
          </div>
          <div className="command-table">
            <table>
              <thead>
                <tr>
                  {[
                    "Produit",
                    "Entrepôt",
                    "Physique",
                    "Réservé",
                    "Disponible",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stock.slice((stockPage - 1) * 10, stockPage * 10).map((r) => (
                  <tr key={r.product_id + ":" + r.warehouse_id}>
                    <td>#{r.product_id}</td>
                    <td>{r.warehouse}</td>
                    <td className="numeric">{r.quantity}</td>
                    <td className="numeric">{r.reserved_quantity}</td>
                    <td className="numeric">{r.available}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ResourceState empty={!!inventory.data && !stock.length} />
          <Pagination
            page={stockPage}
            total={stock.length}
            onChange={setStockPage}
          />
        </Panel>
      )}
      {tab === "reports" && (
        <Panel
          title="Rapports trimestriels"
          description="Rapports matérialisés conservés · pas de recalcul implicite"
        >
          <div className="command-table">
            <table>
              <thead>
                <tr>
                  <th>Période</th>
                  <th>Commandes</th>
                  <th>CA net</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {d?.quarters.map((q) => (
                  <tr key={q.period}>
                    <td>{q.period}</td>
                    <td>{q.document.order_count}</td>
                    <td>{money(q.document.net_cents)}</td>
                    <td>{q.release_id.slice(0, 12)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ResourceState empty={!!d && !d.quarters.length} />
        </Panel>
      )}
      <Panel
        title="Fiabilité des données"
        description="Fraîcheur, traitement et rapprochement de la dernière projection"
        action={
          <Badge
            value={d?.pipeline.reconciliation.status || "Non disponible"}
            tone={
              d?.pipeline.reconciliation.status === "PASS" ? "good" : "neutral"
            }
          />
        }
      >
        <details>
          <summary>
            Déplier le pipeline et les contrôles de rapprochement
          </summary>
          <div className="fact-grid">
            <Fact label="Pipeline" value={d?.metadata.pipeline_state} />
            <Fact
              label="Dernière réussite"
              value={dateTime(d?.metadata.last_refresh_at)}
            />
            <Fact
              label="Kafka consumer lag"
              value={integer(d?.pipeline.pipeline.metrics.kafka_lag)}
            />
            <Fact
              label="Mesuré à"
              value={dateTime(d?.pipeline.pipeline.metrics.lag_measured_at)}
            />
            <Fact
              label="Événements en quarantaine"
              value={integer(d?.pipeline.pipeline.metrics.invalid_records)}
            />
            <Fact
              label="Fraîcheur"
              value={
                d?.metadata.freshness_seconds == null
                  ? "Non mesurée"
                  : Math.round(d.metadata.freshness_seconds) + " s"
              }
            />
          </div>
          <div className="command-table">
            <table>
              <thead>
                <tr>
                  <th>Mesure</th>
                  <th>Source</th>
                  <th>Analytics</th>
                  <th>Écart</th>
                </tr>
              </thead>
              <tbody>
                {d?.pipeline.reconciliation.checks.map((c) => (
                  <tr key={c.metric}>
                    <td>{c.metric}</td>
                    <td>{c.source}</td>
                    <td>{c.analytical}</td>
                    <td>{c.difference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Panel>
      <p className="inline-note">
        Comparaisons de périodes non affichées sans contrôle d’équivalence. Les
        captures et remboursements conservent leur définition Phase 6 ; aucun
        montant n’est recalculé par le navigateur.
      </p>
    </div>
  );
}
