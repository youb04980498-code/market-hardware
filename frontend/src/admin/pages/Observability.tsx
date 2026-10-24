import { useState } from "react";
import { request } from "../../api/client";
import { useResource } from "../../hooks/useResource";
import { State } from "../../shared/State";

type Sample = { metric: Record<string, string>; value: [number, string] };
type Observation = {
  metrics: Record<string, Sample[] | null>;
  infrastructure_alerts:
    | { labels: Record<string, string>; annotations: Record<string, string> }[]
    | null;
  unavailable: string[];
  links: Record<string, string>;
};
type Alert = {
  alert_id: string;
  type: string;
  severity: string;
  entity_reference: string;
  first_detected_at: string;
  last_observed_at: string;
  status: string;
  details: Record<string, string | number>;
};
const labels: Record<string, string> = {
  LOW_STOCK: "Stock faible",
  PAYMENT_FAILURE: "Échec de paiement",
  ORDER_SPIKE: "Pic de commandes",
  WAREHOUSE_SATURATION: "Entrepôt saturé",
  ACTIVE: "Active",
  ACKNOWLEDGED: "Acquittée",
  RESOLVED: "Résolue",
};
export function Alerts() {
  const [status, setStatus] = useState("ACTIVE");
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState("");
  const data = useResource(
    () => request<{ items: Alert[] }>(`/api/analytics/alerts?status=${status}`),
    status,
    15000,
  );
  async function act(id: string, action: string) {
    setPending(id);
    setActionError("");
    try {
      await request(`/api/analytics/alerts/${id}/${action}`, {
        method: "POST",
      });
      data.retry();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Action impossible",
      );
    } finally {
      setPending("");
    }
  }
  return (
    <section className="panel">
      <h2>Alertes métier</h2>
      <label>
        État{" "}
        <select aria-label="État" value={status} onChange={(e) => setStatus(e.target.value)}>
          {["ACTIVE", "ACKNOWLEDGED", "RESOLVED"].map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </select>
      </label>
      <button className="button" onClick={data.retry}>
        Actualiser les alertes
      </button>
      <State {...data} empty={data.data?.items.length === 0} />
      {actionError && <p role="alert">{actionError}</p>}
      <div className="service-grid">
        {data.data?.items.map((a) => (
          <article className="service ops-card" key={a.alert_id}>
            <h3>{labels[a.type] || a.type}</h3>
            <p>
              {a.severity === "critical" ? "Critique" : "Avertissement"} ·{" "}
              {labels[a.status]}
            </p>
            <p>Référence : {a.entity_reference}</p>
            <p>
              Détectée : {new Date(a.first_detected_at).toLocaleString("fr-FR")}
            </p>
            <p>
              Dernière observation :{" "}
              {new Date(a.last_observed_at).toLocaleString("fr-FR")}
            </p>
            {a.details.order_id && <p>Commande #{a.details.order_id}</p>}
            {a.status === "ACTIVE" && (
              <button
                disabled={pending === a.alert_id}
                onClick={() => void act(a.alert_id, "acknowledge")}
              >
                Acquitter
              </button>
            )}
            {a.status !== "RESOLVED" && (
              <button
                disabled={pending === a.alert_id}
                onClick={() => void act(a.alert_id, "resolve")}
              >
                Résoudre
              </button>
            )}
          </article>
        ))}
      </div>
      <p className="small muted">
        Actualisation automatique toutes les 15 secondes. Les conditions de
        stock persistantes rouvrent une alerte résolue.
      </p>
    </section>
  );
}
export default function Observability() {
  const data = useResource(
    async () => ({
      observation: await request<Observation>("/api/analytics/observability"),
      at: new Date(),
    }),
    "observability",
    15000,
  );
  const names: Record<string, string> = {
    availability: "Disponibilité des services",
    request_rate: "Requêtes / seconde",
    error_rate: "Erreurs / seconde",
    p95_seconds: "Latence p95 (secondes)",
    kafka_lag: "Retard Kafka (messages)",
    freshness_seconds: "Âge analytique (secondes)",
    spark_input_rate: "Entrées Spark / seconde",
  };
  return (
    <div className="admin-page">
      <p className="eyebrow">PROMETHEUS · OPENTELEMETRY</p>
      <h1>Observabilité</h1>
      <button className="button" onClick={data.retry}>
        Actualiser la supervision
      </button>
      <State {...data} />
      {data.data && (
        <>
          <p>
            Dernière actualisation réussie :{" "}
            {data.data.at.toLocaleTimeString("fr-FR")}
          </p>
          {data.error && (
            <p role="status">Les données affichées peuvent être anciennes.</p>
          )}
          <div className="metrics">
            {Object.entries(names).map(([key, name]) => (
              <section className="panel" key={key}>
                <h2>{name}</h2>
                {data.data?.observation.metrics[key]?.length ? (
                  data.data?.observation.metrics[key]?.map((s, i) => (
                    <p key={i}>
                      {s.metric.service || s.metric.instance || "Pipeline"} :{" "}
                      {Number.isFinite(Number(s.value[1]))
                        ? Number(s.value[1]).toLocaleString("fr-FR", {
                            maximumFractionDigits: 3,
                          })
                        : "Mesure indisponible"}
                    </p>
                  ))
                ) : (
                  <p>Mesure indisponible</p>
                )}
              </section>
            ))}
          </div>
          <section className="panel">
            <h2>Alertes infrastructure</h2>
            {data.data.observation.infrastructure_alerts?.map((a, i) => (
              <p key={i}>
                {a.labels.alertname} : {a.annotations.summary}
              </p>
            ))}
            {data.data.observation.infrastructure_alerts === null && (
              <p>Source indisponible</p>
            )}
            {data.data.observation.infrastructure_alerts?.length === 0 && (
              <p>Aucune alerte infrastructure active</p>
            )}
            <h2>Outils de supervision</h2>
            {Object.entries(data.data.observation.links).map(([name, url]) => (
              <p key={name}>
                <a href={url} target="_blank" rel="noreferrer">
                  Ouvrir {name}
                </a>
              </p>
            ))}
          </section>
        </>
      )}
      <Alerts />
    </div>
  );
}
