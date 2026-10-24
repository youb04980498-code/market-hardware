import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Search, Clock3, TriangleAlert } from "lucide-react";
import { order, payment } from "../../api/market";
import { money } from "../../shared/utils";
import {
  orderCollection,
  integer,
  dateTime,
  statusLabels,
  needsReview,
  terminal,
} from "../data";
import { useAdminResource } from "../useAdminResource";
import {
  PageHeader,
  Kpi,
  Panel,
  Refresh,
  Freshness,
  ResourceState,
  DateRange,
  Pagination,
  Tabs,
  Badge,
  Fact,
  type Range,
} from "../components";
import type { Order } from "../../types";
export function Lifecycle({ o }: { o: Order }) {
  const confirmed = ["PAID", "SHIPPED", "DELIVERED"].includes(o.status);
  const step = o.saga?.step;
  const compensated =
    ["CANCELLED", "PAYMENT_FAILED", "REFUNDED"].includes(o.status) &&
    o.complete;
  const rows = [
    { title: "Commande créée", note: dateTime(o.created_at), state: "done" },
    {
      title: "Réservation du stock",
      note: confirmed
        ? "Allocation confirmée par le statut de commande"
        : o.status === "STOCK_RESERVED"
          ? "Stock réservé"
          : compensated
            ? "Historique de réservation non exposé"
            : "État détaillé non exposé",
      state:
        confirmed || o.status === "STOCK_RESERVED"
          ? "done"
          : step === "RESERVE"
            ? "current"
            : "",
    },
    {
      title: "Paiement traité",
      note: confirmed
        ? "Capture confirmée"
        : o.status === "PAYMENT_FAILED"
          ? "Paiement refusé · commande compensée"
          : o.status === "REFUNDED"
            ? "Paiement remboursé"
            : step === "PAY"
              ? "Traitement en cours"
              : "À vérifier dans le paiement canonique",
      state: confirmed
        ? "done"
        : o.status === "PAYMENT_FAILED"
          ? "failed"
          : step === "PAY"
            ? "current"
            : "",
    },
    {
      title: compensated ? "Compensation terminée" : "Commande confirmée",
      note: compensated
        ? statusLabels[o.status]
        : confirmed
          ? "Paiement capturé et stock alloué"
          : step === "FINALIZE"
            ? "Finalisation en cours"
            : "En attente de finalisation",
      state:
        confirmed || compensated
          ? "done"
          : step === "FINALIZE"
            ? "current"
            : "",
    },
  ];
  return (
    <>
      <ol className="lifecycle">
        {rows.map((r, i) => (
          <li className={r.state} key={r.title}>
            <span className="lifecycle-marker">
              {r.state === "done" ? (
                <Check size={11} />
              ) : r.state === "failed" ? (
                <TriangleAlert size={10} />
              ) : (
                i + 1
              )}
            </span>
            <strong>{r.title}</strong>
            <small>{r.note}</small>
          </li>
        ))}
      </ol>
      <p className="inline-note">
        Lecture des états persistés actuels, pas un journal de transitions.
        Seule la création est horodatée ici. Aucun événement de livraison n’est
        inventé.
      </p>
    </>
  );
}
function OrderInspector({ id }: { id: number }) {
  const detail = useAdminResource(() => order(String(id)), String(id), 15000);
  const o = detail.data;
  const p = useAdminResource(
    () =>
      o?.saga?.payment_id ? payment(o.saga.payment_id) : Promise.resolve(null),
    String(o?.saga?.payment_id || "none"),
  );
  return (
    <Panel
      title={"Commande #" + id}
      description="Investigation du traitement"
      className="order-inspector"
      action={<Link to={"/admin/orders/" + id}>Ouvrir la gestion ↗</Link>}
    >
      <ResourceState {...detail} />
      {o && (
        <>
          <div className="fact-grid">
            <Fact label="Statut" value={<Badge value={o.status} />} />
            <Fact label="Total figé" value={money(o.total_cents)} />
          </div>
          <Lifecycle o={o} />
          <div className="drawer-section">
            <h3>Articles achetés</h3>
            {o.items.map((l) => (
              <Fact
                key={l.product_id}
                label={`${l.quantity} × ${l.product_name || "#" + l.product_id}`}
                value={money(l.quantity * l.unit_price_cents)}
              />
            ))}
            <Fact
              label="Entrepôt"
              value={
                [...new Set(o.items.map((i) => i.warehouse_id))]
                  .filter(Boolean)
                  .join(", ") || "Non renseigné"
              }
            />
          </div>
          <div className="drawer-section">
            <h3>Paiement & orchestration</h3>
            <ResourceState {...p} />
            <Fact
              label="Paiement canonique"
              value={
                p.data ? (
                  <Badge value={p.data.status} />
                ) : o.saga?.payment_id ? (
                  "Chargement / indisponible"
                ) : (
                  "Identifiant non exposé pour cette commande"
                )
              }
            />
            <Fact
              label="Étape Saga"
              value={o.saga?.step || "Historique sans Saga"}
            />
            <Fact
              label="Tentatives persistées"
              value={o.saga ? integer(o.saga.attempts) : "Non disponible"}
            />
            <Fact
              label="Traitement terminé"
              value={o.complete ? "Oui" : "Non"}
            />
            {o.saga?.failure_code && (
              <Fact label="Dernier diagnostic" value={o.saga.failure_code} />
            )}
            <Fact label="Client" value="Profil non exposé dans cette vue" />
          </div>
          {!o.complete && o.saga?.failure_code && (
            <div className="command-error">
              <TriangleAlert size={16} />
              <p>
                Reprise ou compensation en cours. Examiner le diagnostic ; ne
                pas rejouer un paiement avec une nouvelle identité.
              </p>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
export default function Orders() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("all"),
    [search, setSearch] = useState(""),
    [range, setRange] = useState<Range>({ from: "", to: "" }),
    [paymentFilter, setPaymentFilter] = useState(""),
    [page, setPage] = useState(1);
  const resource = useAdminResource(orderCollection, "order-workspace");
  const items = resource.data?.items || [];
  const requested = Number(params.get("selected"));
  const selected = requested > 0 ? requested : undefined;
  const done = (s: string) => ["PAID", "SHIPPED", "DELIVERED"].includes(s);
  const filtered = items.filter(
    (o) =>
      (tab === "all" ||
        (tab === "pending" && !terminal.has(o.status)) ||
        (tab === "complete" && done(o.status)) ||
        (tab === "cancelled" &&
          ["CANCELLED", "PAYMENT_FAILED"].includes(o.status)) ||
        (tab === "refunded" && o.status === "REFUNDED")) &&
      (!search || String(o.order_id).includes(search.replace("#", ""))) &&
      (!range.from || o.created_at.slice(0, 10) >= range.from) &&
      (!range.to || o.created_at.slice(0, 10) < range.to) &&
      (!paymentFilter ||
        (paymentFilter === "captured"
          ? done(o.status)
          : paymentFilter === "failed"
            ? o.status === "PAYMENT_FAILED"
            : o.status === "REFUNDED")),
  );
  function update(fn: () => void) {
    fn();
    setPage(1);
  }
  return (
    <div className="admin-page">
      <PageHeader
        tag="ORDER OPERATIONS / TRANSACTIONS"
        title="Commandes"
        subtitle="Suivez le traitement des commandes."
      >
        <DateRange value={range} onChange={(r) => update(() => setRange(r))} />
        <Refresh loading={resource.loading} onClick={resource.retry} />
      </PageHeader>
      <Freshness at={resource.at} error={resource.error} />
      <ResourceState {...resource} />
      <div className="kpi-strip">
        <Kpi
          label="En cours de traitement"
          value={
            resource.data &&
            integer(items.filter((o) => !terminal.has(o.status)).length)
          }
          note="États non terminaux du périmètre chargé"
        />
        <Kpi
          label="Paiements refusés"
          value={
            resource.data &&
            integer(items.filter((o) => o.status === "PAYMENT_FAILED").length)
          }
          note="Échecs terminaux · pas des incidents ouverts"
        />
        <Kpi
          label="À examiner"
          value={
            resource.data && integer(items.filter((o) => needsReview(o)).length)
          }
          note="Non terminales depuis plus de 15 min · à vérifier"
        />
        <Kpi
          label="Commandes terminées"
          value={
            resource.data && integer(items.filter((o) => done(o.status)).length)
          }
          note="Confirmées, expédiées ou livrées"
        />
      </div>
      <Tabs
        label="Statuts de commande"
        value={tab}
        onChange={(t) => update(() => setTab(t))}
        tabs={[
          { id: "all", label: "Toutes", count: items.length },
          { id: "pending", label: "En cours" },
          { id: "complete", label: "Terminées" },
          { id: "cancelled", label: "Annulées / refusées" },
          { id: "refunded", label: "Remboursées" },
        ]}
      />
      <div className="order-workspace">
        <Panel
          title="Suivi des commandes"
          description={`${integer(resource.data?.total)} commandes enregistrées · filtres sur le périmètre chargé`}
        >
          <div className="filterbar">
            <label className="search-field">
              Rechercher une commande
              <div>
                <Search size={14} />
                <input
                  placeholder="Numéro de commande"
                  value={search}
                  onChange={(e) => update(() => setSearch(e.target.value))}
                />
              </div>
            </label>
            <label>
              Paiement (statut commande)
              <select
                value={paymentFilter}
                onChange={(e) => update(() => setPaymentFilter(e.target.value))}
              >
                <option value="">Tous</option>
                <option value="captured">Capture confirmée</option>
                <option value="failed">Refus terminal</option>
                <option value="refunded">Remboursement complet</option>
              </select>
            </label>
          </div>
          <p className="inline-note">
            Les totaux ci-dessus portent sur toutes les lignes chargées. Les
            filtres ci-dessous se combinent.{" "}
            {resource.data?.truncated
              ? "Limite de 5 000 lignes atteinte : totaux partiels."
              : "Collection paginée complète au moment de la lecture."}
          </p>
          <div className="command-table">
            <table>
              <thead>
                <tr>
                  {[
                    "Commande",
                    "Date UTC",
                    "Statut",
                    "Total",
                    "Investigation",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice((page - 1) * 10, page * 10).map((o) => (
                  <tr
                    key={o.order_id}
                    className={selected === o.order_id ? "selected" : ""}
                  >
                    <td>
                      <button
                        className="row-link"
                        onClick={() =>
                          setParams({ selected: String(o.order_id) })
                        }
                      >
                        #{o.order_id}
                      </button>
                      {needsReview(o) && (
                        <small>
                          <Clock3 size={10} /> Attente prolongée
                        </small>
                      )}
                    </td>
                    <td>{dateTime(o.created_at)}</td>
                    <td>
                      <Badge value={o.status} />
                    </td>
                    <td className="numeric">{money(o.total_cents)}</td>
                    <td>
                      <button
                        aria-label={"Examiner commande " + o.order_id}
                        onClick={() =>
                          setParams({ selected: String(o.order_id) })
                        }
                      >
                        Examiner
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ResourceState empty={!!resource.data && !filtered.length} />
          <Pagination page={page} total={filtered.length} onChange={setPage} />
        </Panel>
        {selected ? (
          <OrderInspector key={selected} id={selected} />
        ) : (
          <Panel
            title="Parcours de la commande"
            description="Sélectionnez une commande pour enquêter"
          >
            <div className="command-empty">
              <Clock3 size={30} />
              <strong>Du stock à la confirmation</strong>
              <p>
                Visualisez le paiement, les articles figés et la progression
                durable du traitement.
              </p>
            </div>
            <div className="insights-line">
              Une transaction compensée et terminée ne nécessite pas une
              nouvelle capture.
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
