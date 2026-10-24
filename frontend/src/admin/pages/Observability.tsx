import { useState, useEffect, useRef } from "react";
import { ExternalLink, Server, Database, Radio } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { request } from "../../api/client";
import { analytics, type Pipeline } from "../../api/analytics";
import { useAdminResource } from "../useAdminResource";
import { metric, integer, dateTime, type Observation } from "../data";
import {
  PageHeader,
  Kpi,
  Panel,
  Refresh,
  Freshness,
  ResourceState,
  Drawer,
  Fact,
  Badge,
} from "../components";
import Alerts from "../Alerts";
export { default as Alerts } from "../Alerts";
type Matrix = { metric: Record<string, string>; values: [number, string][] };
type History = {
  observed_at: string;
  series: Record<string, Matrix[] | null>;
  unavailable: string[];
};
type Trace = {
  trace_id: string;
  service: string;
  operation: string;
  duration_ms: number;
  started_at_us: number;
  error: boolean;
};
type Node = {
  id: string;
  name: string;
  description: string;
  instance?: string;
  service?: string;
  dependencies: string[];
  tool?: string;
};
const groups = [
  [
    {
      id: "traefik",
      name: "Traefik",
      description: "Passerelle HTTP",
      instance: "traefik:8082",
      dependencies: [
        "catalog",
        "orders",
        "inventory",
        "payments",
        "auth",
        "analytics",
      ],
      tool: "grafana",
    },
  ],
  [
    {
      id: "catalog",
      name: "Catalogue API",
      description: "Catalogue publié · GraphQL",
      instance: "catalog-graphql:8080",
      service: "catalog",
      dependencies: ["mongo", "neo4j"],
    },
    {
      id: "orders",
      name: "Orders API",
      description: "Checkout & Saga",
      instance: "orders:8080",
      service: "orders",
      dependencies: ["auth", "inventory", "payments", "catalog", "postgres"],
    },
    {
      id: "inventory",
      name: "Inventory API",
      description: "Disponibilité & réservation",
      instance: "inventory:8080",
      service: "inventory",
      dependencies: ["auth", "orders", "postgres"],
    },
    {
      id: "payments",
      name: "Payments API",
      description: "Paiements simulés",
      instance: "payments:8080",
      service: "payments",
      dependencies: ["auth", "orders", "postgres"],
    },
    {
      id: "auth",
      name: "Auth API",
      description: "Sessions & permissions",
      instance: "auth:8080",
      service: "auth",
      dependencies: ["postgres"],
    },
  ],
  [
    {
      id: "mongo",
      name: "MongoDB",
      description: "Catalogue · exporteur",
      instance: "mongodb-exporter:9216",
      dependencies: [],
    },
    {
      id: "neo4j",
      name: "Neo4j",
      description: "Compatibilité · pas de scrape",
      dependencies: [],
    },
    {
      id: "postgres",
      name: "PostgreSQL",
      description: "Transactions · exporteur",
      instance: "postgres-exporter:9187",
      dependencies: [],
    },
    {
      id: "outbox",
      name: "Outbox publisher",
      description: "Événements acquittés",
      dependencies: ["postgres", "kafka"],
    },
  ],
  [
    {
      id: "kafka",
      name: "Kafka",
      description: "Broker · exporteur",
      instance: "kafka-exporter:9308",
      dependencies: [],
    },
    {
      id: "spark",
      name: "Spark Streaming",
      description: "Ingestion & fenêtres",
      dependencies: ["kafka", "postgres", "minio"],
    },
  ],
  [
    {
      id: "minio",
      name: "Delta Lake / MinIO",
      description: "Tables, zones & checkpoints",
      instance: "minio:9000",
      dependencies: [],
    },
    {
      id: "analytics",
      name: "Analytics API",
      description: "Projections matérialisées",
      instance: "analytics:8080",
      service: "analytics",
      dependencies: ["postgres", "auth"],
    },
  ],
] satisfies Node[][];
const nodes: Node[] = groups.flat();
// Draw only configured relationships, not a guessed request/health propagation graph.
const edges = [
  ["traefik", "catalog"],
  ["traefik", "orders"],
  ["traefik", "inventory"],
  ["traefik", "payments"],
  ["traefik", "auth"],
  ["catalog", "mongo"],
  ["catalog", "neo4j"],
  ["orders", "postgres"],
  ["inventory", "postgres"],
  ["payments", "postgres"],
  ["auth", "postgres"],
  ["postgres", "outbox"],
  ["outbox", "kafka"],
  ["kafka", "spark"],
  ["spark", "minio"],
  ["spark", "postgres"],
  ["postgres", "analytics"],
];
function Topology({
  observation,
  pipeline,
  onSelect,
}: {
  observation?: Observation;
  pipeline?: Pipeline;
  onSelect: (n: Node) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function update() {
      if (!el) return;
      const base = el.getBoundingClientRect();
      setPaths(
        edges.flatMap(([a, b]) => {
          const from = el
              .querySelector(`[data-node="${a}"]`)
              ?.getBoundingClientRect(),
            to = el
              .querySelector(`[data-node="${b}"]`)
              ?.getBoundingClientRect();
          if (!from || !to) return [];
          const x1 = from.right - base.left,
            y1 = from.top + from.height / 2 - base.top,
            x2 = to.left - base.left,
            y2 = to.top + to.height / 2 - base.top;
          return [
            `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`,
          ];
        }),
      );
    }
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <div className="topology" ref={ref}>
        <svg className="topology-lines" aria-hidden="true">
          {paths.map((p, i) => (
            <path d={p} key={i} />
          ))}
        </svg>
        {groups.map((g, i) => (
          <div className="topology-column" key={i}>
            <div className="topology-label">
              {
                [
                  "Accès",
                  "Services métier",
                  "Persistance / événements",
                  "Streaming",
                  "Restitution",
                ][i]
              }
            </div>
            {g.map((n) => {
              const value =
                "instance" in n
                  ? metric(observation?.metrics.availability, n.instance)
                  : undefined;
              const state =
                n.id === "spark" ? pipeline?.pipeline.state : undefined;
              return (
                <button
                  data-node={n.id}
                  className="topology-node"
                  key={n.id}
                  title={n.description + " · cliquer pour examiner"}
                  onClick={() => onSelect(n)}
                >
                  <strong>{n.name}</strong>
                  <small>{n.description}</small>
                  <Badge
                    value={
                      state
                        ? state
                        : value == null
                          ? "Non mesuré"
                          : value === 1
                            ? "Scrape accessible"
                            : "Scrape en échec"
                    }
                    tone={
                      state
                        ? ["RUNNING", "REFRESHING"].includes(state)
                          ? "good"
                          : "warn"
                        : value == null
                          ? "neutral"
                          : value === 1
                            ? "good"
                            : "bad"
                    }
                  />
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="topology-caption">
        <span>
          Connexions structurelles configurées · aucune latence de liaison
          déduite
        </span>
        <span>
          Un exporteur accessible ne prouve pas à lui seul la disponibilité de
          sa base.
        </span>
      </div>
    </>
  );
}
function HistoryChart({
  history,
  keys,
  service,
  unit,
}: {
  history?: History;
  keys: { key: string; name: string; color: string; dash?: string }[];
  service: string;
  unit: string;
}) {
  const points = new Map<number, Record<string, number | string | null>>();
  keys.forEach((k) =>
    history?.series[k.key]
      ?.filter((s) => !service || s.metric.service === service)
      .forEach((s) =>
        s.values.forEach(([at, v]) => {
          const row = points.get(at) || {
            at,
            label: new Date(at * 1000).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "UTC",
            }),
          };
          const n = Number(v);
          row[k.key] = Number.isFinite(n)
            ? n * (unit === "ms" ? 1000 : 1)
            : null;
          points.set(at, row);
        }),
      ),
  );
  const rows = [...points.values()].sort((a, b) => Number(a.at) - Number(b.at));
  // With all services selected, averages of quantiles are misleading. Require a service.
  if (!service)
    return (
      <p className="inline-note">
        Sélectionnez un service pour afficher une série non agrégée. Les
        quantiles de services distincts ne sont pas moyennés.
      </p>
    );
  return rows.length ? (
    <>
      <div
        className="chart-stage"
        role="img"
        aria-label={`Historique ${unit} du service ${service}, fenêtre 30 minutes`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            accessibilityLayer
            margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" minTickGap={40} />
            <YAxis domain={[0, "auto"]} tickCount={4} width={45} />
            <Tooltip
              formatter={(v) =>
                Number(v).toLocaleString("fr-FR", {
                  maximumFractionDigits: 3,
                }) +
                " " +
                unit
              }
            />
            <Legend />
            {keys.map((k) => (
              <Line
                key={k.key}
                dataKey={k.key}
                name={k.name}
                stroke={k.color}
                strokeDasharray={k.dash}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details>
        <summary>Valeurs des séries</summary>
        <div className="command-table">
          <table>
            <thead>
              <tr>
                <th>Heure UTC</th>
                {keys.map((k) => (
                  <th key={k.key}>
                    {k.name} ({unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.at}>
                  <td>{r.label}</td>
                  {keys.map((k) => (
                    <td key={k.key}>
                      {r[k.key] == null
                        ? "—"
                        : Number(r[k.key]).toLocaleString("fr-FR", {
                            maximumFractionDigits: 3,
                          })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  ) : (
    <ResourceState empty />
  );
}
export default function Observability() {
  const [service, setService] = useState("orders"),
    [selected, setSelected] = useState<Node>();
  const resource = useAdminResource(
    () => request<Observation>("/api/analytics/observability"),
    "monitoring",
    30000,
  );
  const history = useAdminResource(
    () => request<History>("/api/analytics/observability/history"),
    "monitoring-history",
    60000,
  );
  const pipeline = useAdminResource(
    () => analytics<Pipeline>("pipeline/status"),
    "monitoring-pipeline",
    30000,
  );
  const traces = useAdminResource(
    () =>
      request<{ items: Trace[]; unavailable: boolean }>(
        "/api/analytics/observability/traces?service=" + service,
      ),
    service,
  );
  const d = resource.data;
  const m = d?.metrics;
  const p = pipeline.data?.data;
  const healthy = m?.availability?.filter(
    (s) => Number(s.value[1]) === 1,
  ).length;
  const total = m?.availability?.length;
  const requests = metric(m?.request_rate, service),
    errors = metric(m?.error_rate, service),
    p95 = metric(m?.p95_seconds, service);
  const filteredAlerts = d?.infrastructure_alerts || [];
  const lag = metric(m?.kafka_lag);
  const cpu = metric(
    m?.process_cpu,
    nodes.find((n) => n.service === service)?.instance,
  );
  const mem = metric(
    m?.process_memory_bytes,
    nodes.find((n) => n.service === service)?.instance,
  );
  function refresh() {
    resource.retry();
    history.retry();
    pipeline.retry();
    traces.retry();
  }
  const traceBase = d?.links.tracing || "http://localhost:16686";
  const selectedSample = selected?.instance
    ? metric(m?.availability, selected.instance)
    : undefined;
  return (
    <div className="admin-page reliability-page">
      <PageHeader
        tag="PLATFORM RELIABILITY / SUPERVISION"
        title="Observabilité"
        subtitle="Surveillez la santé de votre plateforme."
      >
        <a
          className="admin-button"
          target="_blank"
          rel="noreferrer"
          href={d?.links.grafana || "http://localhost:3000"}
        >
          Grafana <ExternalLink size={13} />
        </a>
        <a
          className="admin-button"
          target="_blank"
          rel="noreferrer"
          href={traceBase}
        >
          Tracing <ExternalLink size={13} />
        </a>
        <Refresh loading={resource.loading} onClick={refresh} />
      </PageHeader>
      <Freshness at={resource.at} error={resource.error} />
      <ResourceState {...resource} />
      <div className="kpi-strip">
        <Kpi
          label="Cibles de supervision accessibles"
          value={total ? `${healthy} / ${total}` : "—"}
          note="Scrapes Prometheus · pas un inventaire Docker"
        />
        <Kpi
          label={"Latence API P95 · " + service}
          value={
            p95 == null
              ? "—"
              : (p95 * 1000).toLocaleString("fr-FR", {
                  maximumFractionDigits: 1,
                }) + " ms"
          }
          note="Histogramme HTTP · fenêtre glissante de 5 min"
        />
        <Kpi
          label={"Taux d’erreur HTTP · " + service}
          value={
            requests != null && requests > 0 && errors != null
              ? ((errors / requests) * 100).toLocaleString("fr-FR", {
                  maximumFractionDigits: 2,
                }) + " %"
              : "—"
          }
          note="5xx / requêtes · 5 min · sans trafic : indisponible"
        />
        <Kpi
          label="Kafka consumer lag"
          value={integer(lag)}
          note="Offsets broker moins progression du checkpoint"
        />
      </div>
      <Panel
        title="Architecture de la plateforme"
        description="Sélectionnez un service pour examiner ses mesures et dépendances"
        action={
          <Badge
            value={
              resource.error
                ? "Lecture interrompue"
                : total && healthy === total
                  ? "Collecte disponible"
                  : "Collecte à vérifier"
            }
            tone={
              !resource.error && total && healthy === total ? "good" : "warn"
            }
          />
        }
      >
        <Topology observation={d} pipeline={p} onSelect={setSelected} />
      </Panel>
      <div className="filterbar">
        <label>
          Service observé
          <select
            aria-label="Service observé"
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            {[
              "auth",
              "orders",
              "inventory",
              "payments",
              "catalog",
              "analytics",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <span className="inline-note">
          Historique 30 min · échantillon 60 s · taux/quantiles sur 5 min ·
          actualisation 60 s
        </span>
      </div>
      <ResourceState {...history} />
      <div className="command-grid equal">
        <Panel
          title="Latence des API"
          description={
            "Service " + service + " · millisecondes · quantiles distincts"
          }
        >
          <HistoryChart
            history={history.data}
            service={service}
            unit="ms"
            keys={[
              { key: "p50", name: "P50", color: "#a6b2c9" },
              { key: "p95", name: "P95", color: "var(--accent)" },
              { key: "p99", name: "P99", color: "#6a478e", dash: "4 3" },
            ]}
          />
        </Panel>
        <Panel
          title="Trafic et erreurs"
          description={"Service " + service + " · requêtes par seconde"}
        >
          <HistoryChart
            history={history.data}
            service={service}
            unit="req/s"
            keys={[
              { key: "traffic", name: "Trafic HTTP", color: "var(--accent)" },
              { key: "errors", name: "Erreurs 5xx", color: "var(--danger)" },
            ]}
          />
        </Panel>
      </div>
      <Panel
        title="Pipeline de données"
        description="Indicateurs propres à chaque étape · aucune santé déduite d’un service voisin"
      >
        <ResourceState {...pipeline} />
        <div className="pipeline-stages">
          <div>
            <Radio size={18} />
            <strong>Kafka</strong>
            <small>Retard du consommateur</small>
            <Badge
              value={lag == null ? "Non mesuré" : integer(lag) + " événements"}
              tone={lag == null ? "neutral" : lag > 100 ? "warn" : "good"}
            />
            <p className="inline-note">
              {dateTime(p?.pipeline.metrics.lag_measured_at)}
            </p>
          </div>
          <div>
            <Server size={18} />
            <strong>Spark Streaming</strong>
            <small>État persisté du worker</small>
            <Badge value={p?.pipeline.state || "Non mesuré"} />
            <p className="inline-note">
              Entrée :{" "}
              {metric(m?.spark_input_rate) == null
                ? "—"
                : metric(m?.spark_input_rate)?.toFixed(2)}{" "}
              lignes/s
            </p>
          </div>
          <div>
            <Database size={18} />
            <strong>Delta Lake / MinIO</strong>
            <small>Dernière ingestion connue</small>
            <p className="small">
              {dateTime(p?.pipeline.metrics.last_ingestion_at)}
            </p>
            <p className="inline-note">
              Quarantaine : {integer(p?.pipeline.metrics.invalid_records)}
            </p>
          </div>
          <div>
            <Server size={18} />
            <strong>Analytics API</strong>
            <small>Fraîcheur de la projection</small>
            <Badge
              value={
                pipeline.data?.metadata.stale
                  ? "Projection ancienne"
                  : pipeline.data
                    ? "Projection vérifiée"
                    : "Non mesurée"
              }
              tone={pipeline.data?.metadata.stale ? "warn" : "neutral"}
            />
            <p className="inline-note">
              {pipeline.data?.metadata.freshness_seconds == null
                ? "—"
                : Math.round(pipeline.data.metadata.freshness_seconds) +
                  " s"}{" "}
              · Rapprochement {p?.reconciliation.status || "—"}
            </p>
          </div>
        </div>
      </Panel>
      <div className="command-grid equal">
        <Panel
          title="Ressources du processus API"
          description={
            service + " · processus Python instrumenté, pas la machine hôte"
          }
        >
          <div className="resource-mini">
            <div>
              <p>CPU · cœurs utilisés</p>
              <strong>
                {cpu == null
                  ? "—"
                  : cpu.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
              </strong>
              <small>Moyenne sur 5 minutes</small>
            </div>
            <div>
              <p>Mémoire résidente</p>
              <strong>
                {mem == null ? "—" : (mem / 1024 / 1024).toFixed(1) + " Mio"}
              </strong>
              <small>Dernier échantillon collecté</small>
            </div>
            <div>
              <p>État des conteneurs</p>
              <strong>—</strong>
              <small>Inventaire Docker non exposé au navigateur</small>
            </div>
            <div>
              <p>Occupation du stockage</p>
              <strong>—</strong>
              <small>Capacité totale/utilisée non exposée par ce contrat</small>
            </div>
          </div>
        </Panel>
        <Panel
          title="Alertes techniques"
          description="Alertmanager · état courant de la supervision"
        >
          <div className="bounded-list">
            {filteredAlerts.map((a, i) => (
              <div className="priority-row" key={i}>
                <div>
                  <h3>{a.labels.alertname || "Alerte technique"}</h3>
                  <p>
                    {a.labels.instance || a.labels.service || "Plateforme"} ·{" "}
                    {dateTime(a.startsAt)}
                  </p>
                  <p>
                    {a.annotations.summary ||
                      a.annotations.description ||
                      "Consulter le diagnostic de supervision."}
                  </p>
                </div>
                <Badge value={a.labels.severity || "warning"} />
                <a
                  href={d?.links.grafana || "http://localhost:3000"}
                  target="_blank"
                  rel="noreferrer"
                >
                  Examiner
                </a>
              </div>
            ))}
          </div>
          {d?.infrastructure_alerts === null ? (
            <p className="inline-note">Alertmanager indisponible.</p>
          ) : (
            <ResourceState empty={!!d && !filteredAlerts.length} />
          )}
        </Panel>
      </div>
      <Panel
        title="Traces distribuées récentes"
        description={
          "Service " + service + " · dernière heure · dix résumés maximum"
        }
        action={
          <a href={traceBase} target="_blank" rel="noreferrer">
            Ouvrir le tracing ↗
          </a>
        }
      >
        <ResourceState
          {...traces}
          empty={!!traces.data && !traces.data.items.length}
        />
        {traces.data?.unavailable && (
          <p role="alert">
            Backend de tracing indisponible. Aucun attribut sensible n’est
            transmis.
          </p>
        )}
        <div className="command-table">
          <table>
            <thead>
              <tr>
                {[
                  "Trace ID",
                  "Service",
                  "Opération",
                  "Durée",
                  "État",
                  "Heure UTC",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {traces.data?.items.map((t) => (
                <tr key={t.trace_id}>
                  <td>
                    <a
                      href={
                        traceBase + "/trace/" + encodeURIComponent(t.trace_id)
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.trace_id.slice(0, 16)}…
                    </a>
                  </td>
                  <td>{t.service}</td>
                  <td>{t.operation}</td>
                  <td>{t.duration_ms.toFixed(1)} ms</td>
                  <td>
                    <Badge
                      value={
                        t.error ? "Erreur observée" : "Sans erreur signalée"
                      }
                      tone={t.error ? "bad" : "neutral"}
                    />
                  </td>
                  <td>
                    {dateTime(new Date(t.started_at_us / 1000).toISOString())}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Alerts />
      {selected && (
        <Drawer
          title={selected.name}
          subtitle={selected.description}
          onClose={() => setSelected(undefined)}
        >
          <Fact
            label="Collecte de supervision"
            value={
              selectedSample == null
                ? "Non mesurée"
                : selectedSample === 1
                  ? "Scrape accessible"
                  : "Scrape en échec"
            }
          />
          <Fact
            label="P95 HTTP (5 min)"
            value={
              selected.service &&
              metric(m?.p95_seconds, selected.service) != null
                ? (metric(m?.p95_seconds, selected.service)! * 1000).toFixed(
                    1,
                  ) + " ms"
                : "Non disponible"
            }
          />
          <Fact
            label="Débit HTTP"
            value={
              selected.service &&
              metric(m?.request_rate, selected.service) != null
                ? metric(m?.request_rate, selected.service)!.toFixed(3) +
                  " req/s"
                : "Non disponible"
            }
          />
          <Fact
            label="Erreurs HTTP 5xx"
            value={
              selected.service &&
              metric(m?.error_rate, selected.service) != null
                ? metric(m?.error_rate, selected.service)!.toFixed(3) + " req/s"
                : "Non disponible"
            }
          />
          <Fact
            label="Dépendances configurées"
            value={
              selected.dependencies
                .map((id) => nodes.find((n) => n.id === id)?.name || id)
                .join(", ") || "Aucune dépendance sortante représentée"
            }
          />
          <div className="drawer-section">
            <h3>Investigation</h3>
            <p>
              La collecte mesure l’endpoint indiqué. Pour une base derrière un
              exporteur, elle ne remplace pas un contrôle fonctionnel de la
              base. Les connexions du schéma décrivent l’architecture configurée
              et ne sont pas des traces de trafic.
            </p>
            <div className="quick-links">
              <a
                className="admin-button"
                href={d?.links.grafana || "http://localhost:3000"}
                target="_blank"
                rel="noreferrer"
              >
                Grafana
              </a>
              <a
                className="admin-button"
                href={traceBase}
                target="_blank"
                rel="noreferrer"
              >
                Tracing
              </a>
            </div>
          </div>
          <div className="drawer-section">
            <h3>Alertes associées</h3>
            {filteredAlerts
              .filter(
                (a) =>
                  a.labels.instance === selected.instance ||
                  a.labels.service === selected.service,
              )
              .map((a, i) => (
                <Fact
                  key={i}
                  label={a.labels.alertname}
                  value={a.labels.severity}
                />
              ))}
            <p>
              Les événements métier sont disponibles dans le panneau des alertes
              persistées.
            </p>
          </div>
        </Drawer>
      )}
      <p className="inline-note">
        Outils de supervision locaux : Grafana, Prometheus et Jaeger. Aucun
        secret ni endpoint privilégié n’est interrogé directement par le
        navigateur. Les points de monitoring manquants restent indisponibles.
      </p>
    </div>
  );
}
