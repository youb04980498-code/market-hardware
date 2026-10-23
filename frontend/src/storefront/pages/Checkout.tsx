import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../cart";
import { useAuth } from "../../auth/session";
import {
  checkout,
  validateCart,
  warehouses,
  numericProductId,
} from "../../api/market";
import { useResource } from "../../hooks/useResource";
import { money } from "../../shared/utils";
import { State } from "../../shared/State";
import type { CartBody, ValidatedCart } from "../../types";
interface Attempt {
  key: string;
  body: CartBody;
  userId: number;
}
export default function Checkout() {
  const { items, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [wid, setWid] = useState("1");
  const [validated, setValidated] = useState<ValidatedCart>();
  const [validatedBody, setValidatedBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("market-checkout") ?? "null");
    } catch {
      return null;
    }
  });
  const lock = useRef(false);
  const locations = useResource(
    () => (items[0] ? warehouses(items[0].productId) : Promise.resolve([])),
    items.map((i) => i.productId).join(","),
  );
  const body: CartBody = {
    warehouse_id: Number(wid),
    items: items.map((i) => ({
      product_id: Number(i.productId),
      quantity: i.quantity,
    })),
  };
  async function submit(confirm: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!attempt) items.forEach((item) => numericProductId(item.productId));
      if (!confirm) {
        setValidated(await validateCart(body));
        setValidatedBody(JSON.stringify(body));
      } else {
        let current = attempt;
        if (current && current.userId !== user!.user_id)
          throw new Error(
            "Une tentative appartient à un autre compte. Retrouvez ce compte pour la réconcilier.",
          );
        if (!current) {
          current = { key: crypto.randomUUID(), body, userId: user!.user_id };
          sessionStorage.setItem("market-checkout", JSON.stringify(current));
          setAttempt(current);
        }
        const result = await checkout(current.body, current.key);
        sessionStorage.removeItem("market-checkout");
        setAttempt(null);
        clear();
        navigate("/account/orders/" + result.order_id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Service indisponible");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="container page">
      <p className="eyebrow">01 PANIER / 02 VÉRIFICATION / 03 COMMANDE</p>
      <h1>Vérifier votre commande</h1>
      <div className="checkout-layout">
        <section className="panel">
          <h2>Stock et prix, confirmés par le serveur</h2>
          <p>Paiement simulé. Aucune carte bancaire demandée.</p>
          {!items.length && !attempt ? (
            <Link to="/shop">Votre panier est vide. Retour au catalogue.</Link>
          ) : (
            <>
              <label>
                Entrepôt de préparation
                <select
                  disabled={!!attempt || busy}
                  value={wid}
                  onChange={(e) => {
                    setWid(e.target.value);
                    setValidated(undefined);
                  }}
                >
                  <option value="1">Entrepôt 1</option>
                  {locations.data
                    ?.filter((w) => w.warehouse_id !== 1)
                    .map((w) => (
                      <option value={w.warehouse_id} key={w.warehouse_id}>
                        {w.name} · {w.city} ({w.available} disponibles pour le
                        premier article)
                      </option>
                    ))}
                </select>
              </label>
              <State error={locations.error} retry={locations.retry} />
              <p className="small muted">
                Le serveur vérifiera la disponibilité de chaque article dans cet
                entrepôt.
              </p>
              {!attempt && (
                <button
                  disabled={busy || !items.length}
                  onClick={() => void submit(false)}
                >
                  Revalider les articles
                </button>
              )}
              {validated && (
                <section className="validated" role="status">
                  <h3>
                    {validated.valid
                      ? "Sélection disponible"
                      : "Stock insuffisant"}
                  </h3>
                  {validated.items.map((i) => (
                    <p key={i.product_id}>
                      {i.product_name} · {i.quantity} —{" "}
                      {money(i.unit_price_cents * i.quantity)}
                    </p>
                  ))}
                  <strong>
                    Total serveur : {money(validated.total_cents)}
                  </strong>
                  {!validated.valid && (
                    <p>Modifiez le panier ou choisissez un autre entrepôt.</p>
                  )}
                </section>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {attempt && (
                <p className="notice">
                  Une tentative est enregistrée. Son résultat reste inconnu.
                  Réessayez avec la même clé ; aucun nouveau paiement
                  indépendant ne sera créé. Vous pouvez aussi consulter votre
                  historique.
                </p>
              )}
              <button
                className="primary"
                disabled={
                  busy ||
                  (!attempt &&
                    (!validated?.valid ||
                      validatedBody !== JSON.stringify(body)))
                }
                onClick={() => void submit(true)}
              >
                {busy
                  ? "Traitement en cours…"
                  : attempt
                    ? "Reprendre la même tentative"
                    : "Confirmer la commande simulée"}
              </button>
            </>
          )}
        </section>
        <aside className="summary">
          <h2>Un paiement, une commande</h2>
          <p>
            Votre tentative est protégée contre les doublons par une clé
            d'idempotence conservée jusqu'à la réponse du serveur.
          </p>
          <p>
            Une attente ou une erreur réseau ne signifie pas un paiement refusé.
          </p>
          <Link to="/account">Consulter mes commandes</Link>
        </aside>
      </div>
    </div>
  );
}
