import { Link } from "react-router-dom";
import { useResource } from "../../hooks/useResource";
import { orders, products } from "../../api/market";
import { request } from "../../api/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "../../shared/card";
import { State } from "../../shared/State";
export function Services() {
  const health = useResource(
    () =>
      Promise.all(
        ["auth", "orders", "inventory", "payments"].map(async (s) => {
          try {
            await request("/api/" + s + "/health", {}, false);
            return { name: s, up: true };
          } catch {
            return { name: s, up: false };
          }
        }),
      ),
    "health",
    15000,
  );
  return (
    <>
      <State {...health} />
      <div className="service-grid">
        {health.data?.map((s) => (
          <div className="service" key={s.name}>
            <span className={s.up ? "status-dot" : "status-dot down"} />
            <strong>{s.name}</strong>
            <span>{s.up ? "Disponible" : "Indisponible"}</span>
          </div>
        ))}
      </div>
      <p className="small muted">
        Readiness REST observée depuis ce navigateur ; ne mesure ni la latence
        historique, ni le lag Kafka, ni Spark.
      </p>
    </>
  );
}
export default function Dashboard() {
  const counts = useResource(() => orders(1, true), "admin-count");
  const catalog = useResource(() => products({ pageSize: 1 }), "catalog-count");
  return (
    <div className="admin-page">
      <p className="eyebrow">PILOTAGE OPÉRATIONNEL</p>
      <h1>Vue d'ensemble</h1>
      <p className="muted">
        Les opérations d'aujourd'hui. Des sources identifiées.
      </p>
      <div className="metrics">
        <Card>
          <CardHeader>
            <CardDescription>
              Orders REST · toutes les données conservées
            </CardDescription>
            <CardTitle>Commandes enregistrées</CardTitle>
          </CardHeader>
          <CardContent>
            <State {...counts} />
            <strong className="metric">{counts.data?.total ?? "—"}</strong>
            <p className="small muted">
              Inclut les fixtures et les commandes de vérification ; ne
              représente pas des ventes réelles.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>
              Catalogue GraphQL · projection publiée
            </CardDescription>
            <CardTitle>Produits actifs</CardTitle>
          </CardHeader>
          <CardContent>
            <State {...catalog} />
            <strong className="metric">{catalog.data?.total ?? "—"}</strong>
            <p className="small muted">
              Produits approuvés, accessibles à la boutique.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Phase 6 · non disponible</CardDescription>
            <CardTitle>Chiffre d'affaires et tendances</CardTitle>
          </CardHeader>
          <CardContent>
            <strong className="metric">—</strong>
            <p>Aucun KPI inventé avant l'API Analytics.</p>
            <Link to="/admin/analytics">État de l'intégration</Link>
          </CardContent>
        </Card>
      </div>
      <section className="panel">
        <h2>Disponibilité des services</h2>
        <Services />
      </section>
      <div className="builder-slots">
        <section className="panel">
          <h2>Suivre les commandes</h2>
          <p>Statuts persistés, prix figés et progression du paiement.</p>
          <Link to="/admin/orders">Voir les commandes →</Link>
        </section>
        <section className="panel">
          <h2>Consulter le stock</h2>
          <p>Quantités physiques, réservées et disponibles par entrepôt.</p>
          <Link to="/admin/inventory">Voir l'inventaire →</Link>
        </section>
      </div>
    </div>
  );
}
export function Deferred({
  kind,
}: {
  kind: "analytics" | "ai" | "observability";
}) {
  return (
    <div className="admin-page">
      <p className="eyebrow">INTÉGRATION TRANSPARENTE</p>
      <h1>
        {
          {
            analytics: "Analytics",
            ai: "AI PC Builder",
            observability: "Observabilité",
          }[kind]
        }
      </h1>
      {kind === "observability" ? (
        <>
          <Services />
          <section className="panel">
            <h2>Supervision étendue</h2>
            <p>
              Les métriques Prometheus/Grafana, traces, rétention des logs et
              lag des consommateurs ne sont pas exposés par une API frontend
              approuvée.
            </p>
            <p>
              Les outils locaux restent accessibles selon le profil monitoring
              activé. Aucun statut Kafka ou Spark n'est déduit de la santé REST.
            </p>
          </section>
        </>
      ) : (
        <section className="panel">
          <span className="pill">
            PHASE {kind === "analytics" ? "6" : "7"} · À VENIR
          </span>
          <h2>Service non disponible</h2>
          <p>
            {kind === "analytics"
              ? "Les agrégats temps réel et trimestriels nécessitent les pipelines et l'API Analytics."
              : "Les diagnostics et configurations nécessitent le solveur déterministe et l'API AI."}
          </p>
          <p>
            Aucune donnée de démonstration n'est utilisée pour remplacer cette
            intégration.
          </p>
        </section>
      )}
    </div>
  );
}
