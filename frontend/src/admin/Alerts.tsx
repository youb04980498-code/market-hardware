import { useState } from "react";
import { Link } from "react-router-dom";
import { TriangleAlert, ArrowUpRight } from "lucide-react";
import { incidents, statusLabels, dateTime, type Incident } from "./data";
import { request } from "../api/client";
import { useAdminResource } from "./useAdminResource";
import { Badge, Panel, ResourceState, Pagination } from "./components";
export const incidentLink = (a: Incident) =>
  a.details.order_id
    ? `/admin/orders?selected=${a.details.order_id}`
    : a.type === "LOW_STOCK"
      ? `/admin/inventory?product=${a.details.product_id || ""}&warehouse=${a.details.warehouse_id || ""}`
      : a.type === "WAREHOUSE_SATURATION"
        ? `/admin/inventory?warehouse=${a.entity_reference}`
        : "/admin/orders";
export default function Alerts({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState("ACTIVE"),
    [page, setPage] = useState(1),
    [pending, setPending] = useState(""),
    [actionError, setActionError] = useState("");
  const resource = useAdminResource(() => incidents(status), status, 30000);
  const items = [...(resource.data?.items || [])].sort(
    (a, b) =>
      (a.severity === "critical" ? -1 : 0) -
        (b.severity === "critical" ? -1 : 0) ||
      b.first_detected_at.localeCompare(a.first_detected_at),
  );
  async function act(id: string, action: string) {
    setPending(id);
    setActionError("");
    try {
      await request(`/api/analytics/alerts/${id}/${action}`, {
        method: "POST",
      });
      resource.retry();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setPending("");
    }
  }
  return (
    <Panel
      title={compact ? "Alertes nécessitant votre attention" : "Alertes métier"}
      description={
        compact
          ? "Priorité aux incidents critiques non acquittés."
          : "Incidents persistés · actualisation toutes les 30 s"
      }
      action={
        compact ? (
          <Link to="/admin/observability">
            Tout examiner <ArrowUpRight size={12} />
          </Link>
        ) : (
          <label>
            État
            <select
              aria-label="État"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              {["ACTIVE", "ACKNOWLEDGED", "RESOLVED"].map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          </label>
        )
      }
    >
      <ResourceState {...resource} empty={items.length === 0} />
      {actionError && <p role="alert">{actionError}</p>}
      <div className="bounded-list">
        {items
          .slice(compact ? 0 : (page - 1) * 6, compact ? 4 : page * 6)
          .map((a) => (
            <article className="priority-row ops-card" key={a.alert_id}>
              <span className={"priority-icon " + a.severity}>
                <TriangleAlert size={15} />
              </span>
              <div>
                <h3>{statusLabels[a.type] || a.type}</h3>
                <p>Référence : {a.entity_reference}</p>
                <p>
                  {a.details.order_id
                    ? `Commande #${a.details.order_id} · `
                    : ""}
                  {dateTime(a.first_detected_at)}
                </p>
                {!compact && (
                  <p>Dernière observation : {dateTime(a.last_observed_at)}</p>
                )}
                <Badge value={a.status} />
              </div>
              <Link to={incidentLink(a)}>Examiner</Link>
              {!compact && (
                <div className="alert-actions">
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
                </div>
              )}
            </article>
          ))}
      </div>
      {!compact && (
        <Pagination
          page={page}
          total={items.length}
          size={6}
          onChange={setPage}
        />
      )}
      <p className="inline-note">
        Les conditions de stock persistantes peuvent rouvrir une alerte. Les
        commandes compensées restent terminales.
      </p>
    </Panel>
  );
}
