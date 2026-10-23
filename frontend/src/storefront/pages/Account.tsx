import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/session";
import { orders, order, payment } from "../../api/market";
import { request } from "../../api/client";
import { useResource } from "../../hooks/useResource";
import { State } from "../../shared/State";
import { money } from "../../shared/utils";
import { orderMessage } from "../../shared/orderStatus";
import { useState } from "react";
export function OrderList({ admin = false }: { admin?: boolean }) {
  const [page, setPage] = useState(1);
  const data = useResource(
    () => orders(page, admin),
    String(page) + admin,
    5000,
  );
  return (
    <>
      <p className="small muted">
        Source : Orders REST · Page de 20 commandes · Aucun filtre serveur de
        statut disponible.
      </p>
      <State {...data} empty={data.data?.items.length === 0} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Commande</th>
              <th>Date</th>
              <th>Statut</th>
              <th>Total</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {data.data?.items.map((o) => (
              <tr key={o.order_id}>
                <td>#{o.order_id}</td>
                <td>{new Date(o.created_at).toLocaleDateString("fr-FR")}</td>
                <td>
                  <span className={"pill status-" + o.status}>{o.status}</span>
                </td>
                <td>{money(o.total_cents)}</td>
                <td>
                  <Link
                    to={
                      (admin ? "/admin/orders/" : "/account/orders/") +
                      o.order_id
                    }
                  >
                    Voir la commande
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.data && (
        <nav className="pagination">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Précédent
          </button>
          <span>
            Page {page} · {data.data.total} commandes
          </span>
          <button
            disabled={page * 20 >= data.data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
          </button>
        </nav>
      )}
    </>
  );
}
export default function Account() {
  const { user } = useAuth();
  return (
    <div className="container page">
      <p className="eyebrow">MON COMPTE</p>
      <h1>Bonjour, {user?.first_name}.</h1>
      <section className="profile panel">
        <p>
          {user?.first_name} {user?.last_name}
        </p>
        <p>{user?.email}</p>
        <p className="small muted">
          Profil en lecture seule · {user?.roles.join(", ")}
        </p>
      </section>
      <h2>Vos commandes</h2>
      <OrderList />
    </div>
  );
}
export function OrderDetail() {
  const { id = "" } = useParams();
  const data = useResource(() => order(id), id, 2500);
  const o = data.data;
  const paid = useResource(
    () =>
      o?.saga?.payment_id ? payment(o.saga.payment_id) : Promise.resolve(null),
    String(o?.saga?.payment_id) + o?.status,
    5000,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="container page">
      <Link to="/account">Mes commandes</Link>
      <h1>Commande #{id}</h1>
      <State {...data} />
      {o && (
        <>
          <section className="panel" aria-live="polite">
            <span className={"pill status-" + o.status}>{o.status}</span>
            <h2>{orderMessage(o.status, o.complete)}</h2>
            <p>
              Référence serveur #{o.order_id} · {money(o.total_cents)}
            </p>
            {o.saga && (
              <p>
                Étape : {o.saga.step} · Tentatives : {o.saga.attempts}
                {o.saga.failure_code && ` · ${o.saga.failure_code}`}
              </p>
            )}
            <p className="small muted">
              Le paiement et l'allocation du stock sont orchestrés par le
              backend. Aucun délai réseau n'est assimilé à un refus.
            </p>
          </section>
          <section className="panel">
            <h2>Articles et prix figés à l'achat</h2>
            {o.items.map((i) => (
              <div className="order-line" key={i.product_id}>
                <span>
                  {i.product_name ?? "Produit " + i.product_id} × {i.quantity}
                  <small>
                    Entrepôt {i.warehouse_id ?? "historique"} · Publication{" "}
                    {i.publication_version ?? "historique"}
                  </small>
                </span>
                <strong>{money(i.unit_price_cents * i.quantity)}</strong>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>Paiement et logistique</h2>
            <State {...paid} />
            {paid.data ? (
              <p>
                Paiement #{paid.data.payment_id} : {paid.data.status} —{" "}
                {money(paid.data.amount_cents)}
              </p>
            ) : (
              <p>Aucun paiement exposé pour cette commande.</p>
            )}
            <p>
              Suivi transporteur et facturation : intégration ultérieure. Aucune
              date de livraison promise.
            </p>
          </section>
          {!o.complete && o.saga?.step !== "FINALIZE" && (
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void request("/api/orders/" + id + "/cancel", {
                  method: "POST",
                })
                  .then(() => data.retry())
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Demander l'annulation
            </button>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
