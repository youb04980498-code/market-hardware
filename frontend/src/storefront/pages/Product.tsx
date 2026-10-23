import { useParams, Link } from "react-router-dom";
import {
  product,
  compatibility,
  stock,
  warehouses,
  labels,
} from "../../api/market";
import { useResource } from "../../hooks/useResource";
import { useAuth } from "../../auth/session";
import { useCart } from "../cart";
import { money } from "../../shared/utils";
import { State } from "../../shared/State";
import { ProductVisual } from "../components/ProductCard";
import { useState } from "react";
export default function ProductPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const data = useResource(() => product(id), id);
  const related = useResource(() => compatibility(id), id);
  const availability = useResource(
    () => (user ? stock(id) : Promise.resolve(null)),
    id + String(user?.user_id),
  );
  const locations = useResource(
    () => (user ? warehouses(id) : Promise.resolve([])),
    id + String(user?.user_id),
  );
  const add = useCart((s) => s.add);
  const [added, setAdded] = useState(false);
  const p = data.data;
  return (
    <div className="container page">
      <Link className="breadcrumb" to="/shop">
        Boutique / {p ? labels[p.category] : "Produit"}
      </Link>
      <State {...data} />
      {data.data === null && (
        <section className="empty">
          <h1>Produit indisponible</h1>
          <p>Ce produit n'est pas publié ou a été désactivé.</p>
          <Link to="/shop">Retour au catalogue</Link>
        </section>
      )}
      {p && (
        <>
          <div className="product-detail">
            <ProductVisual category={p.category} />
            <section>
              <p className="eyebrow">
                {p.brand} · {p.sku}
              </p>
              <h1>{p.name}</h1>
              <p>{p.description}</p>
              <strong className="detail-price">{money(p.priceCents)}</strong>
              <p className="small muted">
                Version publiée {p.publicationVersion} · EUR
              </p>
              {user ? (
                <>
                  <State {...availability} />
                  {availability.data && (
                    <p className="stock-badge">
                      {availability.data.available > 0
                        ? `${availability.data.available} unités disponibles, tous entrepôts`
                        : "Indisponible"}
                    </p>
                  )}
                </>
              ) : (
                <p className="notice">
                  <Link to="/login">Connectez-vous</Link> pour consulter le
                  stock réel.
                </p>
              )}
              <button
                className="primary"
                disabled={availability.data?.available === 0}
                onClick={() => {
                  add(p);
                  setAdded(true);
                }}
              >
                Ajouter au panier
              </button>
              <p role="status">{added ? "Produit ajouté au panier." : ""}</p>
              <p className="small muted">
                Illustration générique du composant ; aucun visuel fabricant
                n'est fourni par le catalogue.
              </p>
            </section>
          </div>
          <section className="panel">
            <h2>Spécifications techniques</h2>
            <dl className="specs">
              {Object.entries(p.attributes).map(([k, v]) => (
                <div key={k}>
                  <dt>{k.replaceAll("_", " ")}</dt>
                  <dd>
                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          {user && (
            <section className="panel">
              <h2>Disponibilité par entrepôt</h2>
              <State {...locations} />
              {locations.data?.map((w) => (
                <p key={w.warehouse_id}>
                  {w.name} · {w.city} : {w.available} disponibles,{" "}
                  {w.reserved_quantity} réservées
                </p>
              ))}
            </section>
          )}
          <section className="panel">
            <h2>Compatibilités validées</h2>
            <p className="muted">
              Ces relations ne constituent pas la validation d'un PC complet.
            </p>
            <State {...related} />
            {related.data?.length === 0 && (
              <p>Aucune relation vérifiée exposée. Compatibilité inconnue.</p>
            )}
            {related.data?.map((r, i) => (
              <div className="compatibility" key={i}>
                <Link to={"/products/" + r.product.productId}>
                  {r.product.name}
                </Link>
                <small>
                  {r.rule} · {r.ruleVersion} · {r.validationStatus}
                </small>
                <small>Source : {r.provenance}</small>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
