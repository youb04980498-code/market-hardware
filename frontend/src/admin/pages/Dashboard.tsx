import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { request } from "../../api/client";
import { labels } from "../../api/market";
import { money } from "../../shared/utils";
import { business, integer } from "../data";
import { useAdminResource } from "../useAdminResource";
import {
  PageHeader,
  Kpi,
  Panel,
  DateRange,
  periodQuery,
  Freshness,
  Refresh,
  ResourceState,
  ShareList,
  Badge,
  type Range,
} from "../components";
import { OrdersChart } from "../charts";
import Alerts from "../Alerts";
export function Services() {
  const health = useAdminResource(
    () =>
      Promise.all(
        [
          ["auth", "API Auth", "/api/auth/health"],
          ["catalog", "Catalogue", "/health/catalog"],
          ["orders", "Commandes", "/api/orders/health"],
          ["payments", "Paiements", "/api/payments/health"],
          ["inventory", "Inventaire", "/api/inventory/health"],
          ["analytics", "Analytics", "/api/analytics/health"],
        ].map(async ([id, name, path]) => {
          try {
            const r = await request<{ status: string }>(path, {}, false);
            return {
              id,
              name,
              status: r.status === "degraded" ? "Dégradé" : "Disponible",
            };
          } catch {
            return { id, name, status: "Indisponible" };
          }
        }),
      ),
    "executive-readiness",
    30000,
  );
  return (
    <>
      <ResourceState {...health} />
      <div className="service-health-grid">
        {health.data?.map((s) => (
          <div className="service-health service" key={s.id}>
            <strong>{s.name}</strong>
            <Badge
              value={s.status}
              tone={
                s.status === "Disponible"
                  ? "good"
                  : s.status === "Dégradé"
                    ? "warn"
                    : "bad"
              }
            />
            <small>Readiness HTTP</small>
          </div>
        ))}
      </div>
      <p className="inline-note">
        Readiness observée, indépendante des métriques de performance et de la
        réconciliation financière.
      </p>
    </>
  );
}
export default function Dashboard() {
  const [range, setRange] = useState<Range>(() => {
    const from = new Date().toISOString().slice(0, 10);
    return {
      from,
      to: new Date(Date.parse(from) + 86400000).toISOString().slice(0, 10),
    };
  });
  const period = periodQuery(range);
  const resource = useAdminResource(() => business(period), period);
  const today = useAdminResource(
    () =>
      request<{
        hourly: { hour: number; order_count: number }[];
        metadata: { stale: boolean };
      }>("/api/analytics/operations/today"),
    "today-overview",
  );
  const d = resource.data;
  const isToday =
    range.from === new Date().toISOString().slice(0, 10) &&
    range.to ===
      new Date(Date.parse(range.from) + 86400000).toISOString().slice(0, 10);
  const rows = isToday
    ? today.data?.hourly.map((r) => ({
        label: r.hour + " h",
        count: r.order_count,
      })) || []
    : d?.daily.map((r) => ({ label: r.date, count: r.order_count })) || [];
  return (
    <div className="admin-page executive-page">
      <PageHeader
        tag="COMMAND CENTER / ACTIVITÉ"
        title="Vue d’ensemble"
        subtitle="Votre activité en un coup d’œil."
      >
        <DateRange value={range} onChange={setRange} />
        <Refresh
          loading={resource.loading}
          onClick={() => {
            resource.retry();
            today.retry();
          }}
        />
      </PageHeader>
      <Freshness meta={d?.metadata} at={resource.at} error={resource.error} />
      <ResourceState {...resource} />
      <div className="kpi-strip">
        <Kpi
          label="Commandes"
          value={d && integer(d.overview.order_count)}
          note="Sur la période · toutes sources conservées"
          href="/admin/orders"
        />
        <Kpi
          label="Chiffre d’affaires net"
          value={d && money(d.overview.net_cents)}
          note="Captures moins remboursements connus"
          href="/admin/analytics"
        />
        <Kpi
          label="Panier moyen"
          value={d && money(d.overview.aov_cents)}
          note="Brut capturé par commande capturée"
          href="/admin/analytics"
        />
        <Kpi
          label="Clients acheteurs"
          value={d && integer(d.overview.purchasing_customers)}
          note="Acheteurs de la période · pas des sessions actives"
          href="/admin/analytics?tab=customers"
        />
      </div>
      <div className="command-grid">
        <Panel
          title="Évolution des commandes"
          description={
            isToday
              ? "Aujourd’hui · regroupement horaire UTC"
              : "Volume par jour · période sélectionnée"
          }
          action={
            <Link to="/admin/orders">
              Explorer les commandes <ArrowUpRight size={12} />
            </Link>
          }
        >
          {rows.length ? (
            <OrdersChart rows={rows} hourly={isToday} />
          ) : (
            <ResourceState
              empty={!resource.loading}
              loading={resource.loading}
            />
          )}
        </Panel>
        <Panel
          title="Répartition des ventes"
          description="Part du CA net · catégorie publiée actuelle"
        >
          {d?.categories.length ? (
            <ShareList
              rows={d.categories
                .slice()
                .sort((a, b) => b.net_cents - a.net_cents)
                .map((c) => ({
                  label: labels[c.category] || c.category,
                  value: c.net_cents,
                }))}
              format={money}
            />
          ) : (
            <ResourceState empty={!resource.loading} />
          )}
          <p className="inline-note">
            EUR · mêmes cohortes que le CA net. Comparaison précédente non
            disponible dans cette synthèse.
          </p>
        </Panel>
      </div>
      <div className="command-grid equal">
        <Alerts compact />
        <Panel
          title="État de la plateforme"
          description="Six points de contrôle · actualisation 30 s"
          action={
            <Link to="/admin/observability">
              Superviser <ArrowUpRight size={12} />
            </Link>
          }
        >
          <Services />
        </Panel>
      </div>
      <div className="quick-links">
        <span>Accès rapides</span>
        {[
          ["orders", "Commandes"],
          ["inventory", "Inventaire"],
          ["analytics", "Analytics"],
          ["observability", "Observabilité"],
        ].map(([path, name]) => (
          <Link className="admin-button" to={"/admin/" + path} key={path}>
            {name}
            <ArrowUpRight size={12} />
          </Link>
        ))}
      </div>
      <p className="inline-note">
        Périmètre local : données synthétiques historiques et activité de
        vérification. Les métriques ne représentent pas des ventes réelles.
      </p>
    </div>
  );
}
export function Deferred({ kind }: { kind: "ai" | "observability" }) {
  return (
    <div className="admin-page">
      <PageHeader
        title={kind === "ai" ? "AI PC Builder" : "Observabilité"}
        subtitle="Cette intégration reste à venir."
        tag="PHASE 7 · REPORTÉE"
      />
      <Panel title="Service non disponible">
        <p>
          Le solveur et l’API AI restent reportés. Aucune recommandation simulée
          n’est présentée.
        </p>
        <Link to="/admin">Retour au pilotage</Link>
      </Panel>
    </div>
  );
}
