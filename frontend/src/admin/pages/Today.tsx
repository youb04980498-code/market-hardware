import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { request } from "../../api/client";
import { useResource } from "../../hooks/useResource";
import { State } from "../../shared/State";
import { money } from "../../shared/utils";
type TodayData = {
  data: {
    order_count: number;
    gross_cents: number;
    net_cents: number;
    aov_cents: number;
  };
  hourly: { hour: number; order_count: number }[];
  low_stock_count: number;
  metadata: { stale: boolean; last_refresh_at: string; pipeline_state: string };
};
export default function Today() {
  const result = useResource(
    () => request<TodayData>("/api/analytics/operations/today"),
    "today",
    15000,
  );
  return (
    <section className="panel">
      <h2>Aujourd'hui · UTC</h2>
      <button className="button" onClick={result.retry}>
        Actualiser les indicateurs
      </button>
      <State {...result} />
      {result.data && (
        <>
          <p>
            Dernière projection vérifiée :{" "}
            {new Date(result.data.metadata.last_refresh_at).toLocaleString(
              "fr-FR",
            )}
          </p>
          {(result.data.metadata.stale || result.error) && (
            <p role="status">Données anciennes : vérifiez le pipeline.</p>
          )}
          <div className="metrics">
            <article>
              <h3>Commandes du jour</h3>
              <strong className="metric">{result.data.data.order_count}</strong>
            </article>
            <article>
              <h3>CA net du jour</h3>
              <strong className="metric">
                {money(result.data.data.net_cents)}
              </strong>
            </article>
            <article>
              <h3>Panier moyen capturé</h3>
              <strong className="metric">
                {money(result.data.data.aov_cents)}
              </strong>
            </article>
            <article>
              <h3>Stocks faibles</h3>
              <strong className="metric">{result.data.low_stock_count}</strong>
            </article>
          </div>
          <p className="small muted">
            Les montants conservent la reconnaissance Phase 6 : cohortes de
            création des paiements, remboursements connus. Inclut les opérations
            de démonstration.
          </p>
          <h3>Commandes par heure</h3>
          {result.data.hourly.length ? (
            <>
              <div
                className="analytics-chart"
                role="img"
                aria-label="Commandes par heure ; valeurs disponibles ci-dessous"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.data.hourly} accessibilityLayer>
                    <XAxis dataKey="hour" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar
                      dataKey="order_count"
                      name="Commandes"
                      fill="var(--green)"
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <details>
                <summary>Valeurs horaires</summary>
                {result.data.hourly.map((r) => (
                  <p key={r.hour}>
                    {r.hour} h : {r.order_count} commandes
                  </p>
                ))}
              </details>
            </>
          ) : (
            <p>Aucune commande horaire publiée pour aujourd'hui.</p>
          )}
        </>
      )}
    </section>
  );
}
