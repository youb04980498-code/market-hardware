import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import {
  analytics,
  type Overview,
  type Revenue,
  type ProductRow,
  type InventoryRow,
  type Pipeline,
} from "../../api/analytics";
import { useResource } from "../../hooks/useResource";
import { State } from "../../shared/State";
import { money } from "../../shared/utils";
import { Card, CardHeader, CardTitle, CardContent } from "../../shared/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "../../shared/table";

const stamp = (value?: string) =>
  value
    ? new Date(value).toLocaleString("fr-FR", { timeZone: "UTC" }) + " UTC"
    : "Non mesuré";
function Breakdown({
  title,
  rows,
  label,
  value,
  monetary = false,
}: {
  title: string;
  rows: Record<string, string | number>[];
  label: string;
  value: string;
  monetary?: boolean;
}) {
  const format = (n: number) => (monetary ? money(n) : String(n));
  return (
    <section className="panel">
      <h2>{title}</h2>
      {!rows.length ? (
        <State empty />
      ) : (
        <>
          <div
            className="analytics-chart"
            role="img"
            aria-label={title + " ; valeurs dans le tableau suivant."}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={label} />
                <YAxis
                  tickFormatter={(n) =>
                    monetary ? String(Number(n) / 100) + " €" : String(n)
                  }
                  width={75}
                />
                <Tooltip formatter={(n) => format(Number(n))} />
                <Bar
                  dataKey={value}
                  name={title}
                  fill="var(--green)"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details>
            <summary>Valeurs : {title}</summary>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Période ou catégorie</TableHead>
                  <TableHead>{title}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r[label]}</TableCell>
                    <TableCell>{format(Number(r[value]))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        </>
      )}
    </section>
  );
}
export default function Analytics() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [granularity, setGranularity] = useState("month");
  const [category, setCategory] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [low, setLow] = useState(false);
  const [page, setPage] = useState(1);
  const [stockPage, setStockPage] = useState(1);
  const [auto, setAuto] = useState(true);
  const [quarter, setQuarter] = useState("");
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const period = query.toString();
  const key = JSON.stringify({
    period,
    granularity,
    category,
    warehouse,
    low,
    page,
    stockPage,
  });
  const resource = useResource(
    async () => {
      if (from && to && from >= to)
        throw new Error(
          "La date de fin exclusive doit suivre la date de début.",
        );
      const [
        overview,
        revenue,
        products,
        inventory,
        pipeline,
        quarters,
        orders,
      ] = await Promise.all([
        analytics<Overview>("overview", period),
        analytics<Revenue[]>("revenue", period + "&granularity=" + granularity),
        analytics<{
          items: ProductRow[];
          total: number;
          categories: { category: string; net_cents: number }[];
        }>(
          "products/top",
          period +
            "&page_size=10&page=" +
            page +
            (category ? "&category=" + category : ""),
        ),
        analytics<{
          items: InventoryRow[];
          total: number;
          threshold: number;
          warehouses: [number, string][];
        }>(
          "inventory",
          "page_size=10&page=" +
            stockPage +
            "&low_stock_only=" +
            low +
            (warehouse ? "&warehouse_id=" + warehouse : ""),
        ),
        analytics<Pipeline>("pipeline/status"),
        analytics<{ period: string; release_id: string; document: Overview }[]>(
          "quarters",
        ),
        analytics<{
          daily: { date: string; order_count: number }[];
          statuses: { status: string; order_count: number }[];
        }>("orders", period),
      ]);
      if (
        [revenue, products, inventory, pipeline, quarters, orders].some(
          (r) => r.metadata.release_id !== overview.metadata.release_id,
        )
      )
        throw new Error(
          "Une nouvelle version est disponible. Actualisez pour afficher une vue cohérente.",
        );
      return {
        overview,
        revenue,
        products,
        inventory,
        pipeline,
        quarters,
        orders,
      };
    },
    key,
    auto ? 30000 : 0,
  );
  const data = resource.data;
  const meta = data?.overview.metadata;
  const kpi = data?.overview.data;
  const metrics: [string, string | number | undefined][] = [
    ["CA brut capturé", kpi && money(kpi.gross_cents)],
    ["Remboursements", kpi && money(kpi.refunded_cents)],
    ["CA net", kpi && money(kpi.net_cents)],
    ["Panier moyen brut", kpi && money(kpi.aov_cents)],
    ["Commandes", kpi?.order_count],
    ["Payées / expédiées / livrées", kpi?.paid_order_count],
    ["Annulées", kpi?.cancelled_order_count],
    ["En attente", kpi?.pending_order_count],
    ["Clients enregistrés", kpi?.registered_customers],
    ["Clients acheteurs", kpi?.purchasing_customers],
    ["Clients récurrents", kpi?.repeat_customers],
    ["Unités vendues brutes", kpi?.units_sold],
  ];
  return (
    <div className="admin-page analytics-page">
      <p className="eyebrow">PILOTAGE · DONNÉES MATÉRIALISÉES</p>
      <h1>Analytics</h1>
      <p className="muted">
        Données locales synthétiques et activité de vérification conservée.
        Cohortes UTC des paiements, corrigées des remboursements connus.
      </p>
      <form
        className="analytics-filters"
        onSubmit={(e) => {
          e.preventDefault();
          resource.retry();
        }}
      >
        <label>
          Du
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setQuarter("");
              setPage(1);
            }}
          />
        </label>
        <label>
          Au (exclu)
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setQuarter("");
              setPage(1);
            }}
          />
        </label>
        <label>
          Trimestre
          <select
            aria-label="Trimestre"
            value={quarter}
            onChange={(e) => {
              setQuarter(e.target.value);
              setPage(1);
              if (!e.target.value) {
                setFrom("");
                setTo("");
                return;
              }
              const [year, q] = e.target.value.split("-Q").map(Number);
              setFrom(
                new Date(Date.UTC(year, (q - 1) * 3, 1))
                  .toISOString()
                  .slice(0, 10),
              );
              setTo(
                new Date(Date.UTC(year, q * 3, 1)).toISOString().slice(0, 10),
              );
            }}
          >
            <option value="">Plage libre / toutes les dates</option>
            {data?.quarters.data.map((q) => (
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
        <label className="check">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          Actualiser toutes les 30 s
        </label>
        <button type="submit">Actualiser</button>
      </form>
      <State
        loading={resource.loading}
        error={resource.error}
        retry={resource.retry}
      />
      {data && meta && (
        <>
          <section
            className={
              "panel " +
              (meta.stale || resource.error ? "analytics-warning" : "")
            }
            aria-label="Fraîcheur des données"
          >
            <strong>
              {meta.stale || resource.error
                ? "Données périmées ou vérification interrompue"
                : "Dernière vérification réussie"}
            </strong>
            <p>
              {stamp(meta.last_refresh_at)} · Pipeline : {meta.pipeline_state} ·
              Version {meta.release_id.slice(0, 12)}
            </p>
            {meta.error_code && (
              <p role="alert">
                Erreur de traitement : {meta.error_code}. Dernière version
                complète conservée.
              </p>
            )}
            <p className="small">
              Snapshot : {stamp(meta.snapshot_at)}. Cohérence éventuelle : les
              paiements récents peuvent attendre la prochaine publication.
            </p>
          </section>
          <div className="metrics analytics-metrics">
            {metrics.map(([label, value]) => (
              <Card key={label}>
                <CardHeader>
                  <CardTitle>{label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <strong className="metric">{value ?? "—"}</strong>
                </CardContent>
              </Card>
            ))}
          </div>
          <section className="panel">
            <h2>Évolution du chiffre d'affaires</h2>
            {data.revenue.data.length === 0 ? (
              <State empty />
            ) : (
              <>
                <div
                  className="analytics-chart"
                  role="img"
                  aria-label="CA brut, remboursé et net. Valeurs détaillées dans le tableau suivant."
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.revenue.data} accessibilityLayer>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" />
                      <YAxis
                        tickFormatter={(v) => String(Number(v) / 100) + " €"}
                        width={75}
                      />
                      <Tooltip formatter={(v) => money(Number(v))} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="gross_cents"
                        name="Brut"
                        stroke="var(--green)"
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="refunded_cents"
                        name="Remboursé"
                        stroke="var(--error)"
                        strokeDasharray="5 3"
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="net_cents"
                        name="Net"
                        stroke="var(--ink)"
                        strokeDasharray="2 3"
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <details>
                  <summary>Valeurs du graphique</summary>
                  <Table>
                    <TableCaption>Montants en euros, périodes UTC</TableCaption>
                    <TableHeader>
                      <TableRow>
                        {["Période", "Brut", "Remboursé", "Net"].map((h) => (
                          <TableHead key={h}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.revenue.data.map((r) => (
                        <TableRow key={r.period}>
                          <TableCell>{r.period}</TableCell>
                          <TableCell>{money(r.gross_cents)}</TableCell>
                          <TableCell>{money(r.refunded_cents)}</TableCell>
                          <TableCell>{money(r.net_cents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </details>
              </>
            )}
          </section>
          <Breakdown
            title="Commandes par jour"
            rows={data.orders.data.daily}
            label="date"
            value="order_count"
          />
          <Breakdown
            title="Répartition des statuts"
            rows={data.orders.data.statuses}
            label="status"
            value="order_count"
          />
          <Breakdown
            title="CA net par catégorie"
            rows={data.products.data.categories}
            label="category"
            value="net_cents"
            monetary
          />
          <section className="panel">
            <h2>Produits et catégories</h2>
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
                {[
                  "CPU",
                  "MOTHERBOARD",
                  "RAM",
                  "GPU",
                  "SSD",
                  "PSU",
                  "CASE",
                  "COOLER",
                  "PERIPHERAL",
                  "UNKNOWN",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <p className="small muted">
              Prix d'achat figés ; catégorie publiée actuelle. Un remboursement
              ne prouve pas un retour physique.
            </p>
            <Table>
              <TableCaption>Classement par unités vendues brutes</TableCaption>
              <TableHeader>
                <TableRow>
                  {[
                    "Produit",
                    "Catégorie",
                    "Unités",
                    "CA brut",
                    "Remboursé",
                    "CA net",
                  ].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.products.data.items.map((r) => (
                  <TableRow key={r.product_id}>
                    <TableCell>
                      {r.product_id} · {r.name}
                    </TableCell>
                    <TableCell>{r.category}</TableCell>
                    <TableCell>{r.units_sold}</TableCell>
                    <TableCell>{money(r.gross_cents)}</TableCell>
                    <TableCell>{money(r.refunded_cents)}</TableCell>
                    <TableCell>{money(r.net_cents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!data.products.data.total && <State empty />}
            <nav aria-label="Pagination produits">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Produits précédents
              </button>
              <span>
                Page {page} · {data.products.data.total} produits
              </span>
              <button
                disabled={page * 10 >= data.products.data.total}
                onClick={() => setPage(page + 1)}
              >
                Produits suivants
              </button>
            </nav>
            <h3>CA net par catégorie</h3>
            <ul>
              {data.products.data.categories.map((c) => (
                <li key={c.category}>
                  {c.category} : {money(c.net_cents)}
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <h2>Stock observé</h2>
            <div className="analytics-filters">
              <label>
                Entrepôt
                <select
                  value={warehouse}
                  onChange={(e) => {
                    setWarehouse(e.target.value);
                    setStockPage(1);
                  }}
                >
                  <option value="">Tous</option>
                  {data.inventory.data.warehouses.map(([id, name]) => (
                    <option value={id} key={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={low}
                  onChange={(e) => {
                    setLow(e.target.checked);
                    setStockPage(1);
                  }}
                />
                Stock faible (≤ {data.inventory.data.threshold})
              </label>
            </div>
            <p className="small muted">
              État au snapshot, toutes dates confondues. Pour réserver, le stock
              opérationnel reste l'autorité.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "Produit",
                    "Entrepôt",
                    "Physique",
                    "Réservé",
                    "Disponible",
                  ].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.inventory.data.items.map((r) => (
                  <TableRow key={r.product_id + ":" + r.warehouse_id}>
                    <TableCell>{r.product_id}</TableCell>
                    <TableCell>{r.warehouse}</TableCell>
                    <TableCell>{r.quantity}</TableCell>
                    <TableCell>{r.reserved_quantity}</TableCell>
                    <TableCell>{r.available}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!data.inventory.data.total && <State empty />}
            <nav aria-label="Pagination stock">
              <button
                disabled={stockPage === 1}
                onClick={() => setStockPage(stockPage - 1)}
              >
                Stock précédent
              </button>
              <span>
                Page {stockPage} · {data.inventory.data.total} lignes
              </span>
              <button
                disabled={stockPage * 10 >= data.inventory.data.total}
                onClick={() => setStockPage(stockPage + 1)}
              >
                Stock suivant
              </button>
            </nav>
          </section>
          <section className="panel">
            <h2>Rapports trimestriels</h2>
            {!data.quarters.data.length ? (
              <p>
                Aucun trimestre matérialisé. Exécutez le script de traitement
                trimestriel local.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Période</TableHead>
                    <TableHead>Commandes</TableHead>
                    <TableHead>CA net</TableHead>
                    <TableHead>Version</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.quarters.data.map((q) => (
                    <TableRow key={q.period}>
                      <TableCell>{q.period}</TableCell>
                      <TableCell>{q.document.order_count}</TableCell>
                      <TableCell>{money(q.document.net_cents)}</TableCell>
                      <TableCell>{q.release_id.slice(0, 12)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
          <section className="panel">
            <h2>Pipeline et rapprochement</h2>
            <p>
              Rapprochement :{" "}
              <strong>{data.pipeline.data.reconciliation.status}</strong>
            </p>
            <p>
              Kafka : retard{" "}
              {data.pipeline.data.pipeline.metrics.kafka_lag ?? "non mesuré"} ·
              Mesure{" "}
              {stamp(data.pipeline.data.pipeline.metrics.lag_measured_at)}
            </p>
            <p>
              Transport :{" "}
              {data.pipeline.data.pipeline.metrics.bronze_records ?? "—"} ·
              Événements uniques :{" "}
              {data.pipeline.data.pipeline.metrics.unique_events ?? "—"} ·
              Doublons :{" "}
              {data.pipeline.data.pipeline.metrics.duplicate_records ?? "—"} ·
              Quarantaine :{" "}
              {data.pipeline.data.pipeline.metrics.invalid_records ?? "—"}
            </p>
            <details>
              <summary>Contrôles de rapprochement</summary>
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Mesure", "Source", "Analytics", "Écart"].map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.pipeline.data.reconciliation.checks.map((c) => (
                    <TableRow key={c.metric}>
                      <TableCell>{c.metric}</TableCell>
                      <TableCell>{c.source}</TableCell>
                      <TableCell>{c.analytical}</TableCell>
                      <TableCell>{c.difference}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </details>
            <p className="small muted">
              Clients : registre Orders, distinct des comptes Auth. CA :
              captures réussies, jamais paiements en attente ou échoués. Les
              remboursements tardifs corrigent la cohorte initiale ; leur date
              historique peut être inconnue.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
