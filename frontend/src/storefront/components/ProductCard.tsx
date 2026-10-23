// Adapted from ecommerce-react ProductCard: real catalogue fields, separate links/buttons, no demo reviews.
import { Link } from "react-router-dom";
import { useState } from "react";
import type { Product } from "../../types";
import { useCart } from "../cart";
import { money } from "../../shared/utils";
import { labels } from "../../api/market";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/session";
import { useResource } from "../../hooks/useResource";
import { stock } from "../../api/market";
export function ProductVisual({ category }: { category: string }) {
  return (
    <div
      className={"product-visual " + category.toLowerCase()}
      aria-label={"Illustration générique : " + (labels[category] ?? category)}
      role="img"
    >
      <svg viewBox="0 0 240 170" aria-hidden="true">
        <rect
          x="44"
          y="31"
          width="152"
          height="108"
          rx="12"
          fill="currentColor"
          opacity=".12"
        />
        <rect
          x="66"
          y="48"
          width="108"
          height="74"
          rx="6"
          fill="currentColor"
          opacity=".72"
        />
        <rect x="83" y="61" width="74" height="48" rx="3" fill="#e1e7e1" />
        {Array.from({ length: 8 }, (_, i) => (
          <path
            key={i}
            d={`M${76 + i * 12} 35v10 M${76 + i * 12} 125v10`}
            stroke="currentColor"
            strokeWidth="4"
          />
        ))}
        <path d="M94 84h52m-26-17v34" stroke="currentColor" strokeWidth="3" />
      </svg>
      <span>{category}</span>
    </div>
  );
}
export default function ProductCard({ product }: { product: Product }) {
  const user = useAuth()?.user;
  const availability = useResource(
    () => (user ? stock(product.productId) : Promise.resolve(null)),
    product.productId + ":" + String(user?.user_id),
  );
  const add = useCart((s) => s.add);
  const [added, setAdded] = useState(false);
  const { t } = useTranslation();
  return (
    <article className="product-card">
      <Link
        to={"/products/" + product.productId}
        aria-label={product.category + " — " + product.name}
      >
        <ProductVisual category={product.category} />
      </Link>
      <div className="product-info">
        <p className="eyebrow">
          {product.brand} <span>· {labels[product.category]}</span>
        </p>
        <h3>
          <Link to={"/products/" + product.productId}>{product.name}</Link>
        </h3>
        <p className="spec-preview">
          {Object.entries(product.attributes)
            .slice(0, 2)
            .map(([k, v]) => `${k.replaceAll("_", " ")} : ${String(v)}`)
            .join(" · ")}
        </p>
        <div className="product-bottom">
          <strong>{money(product.priceCents)}</strong>
          <button
            className="add"
            onClick={() => {
              add(product);
              setAdded(true);
            }}
            aria-label={"Ajouter " + product.name}
          >
            + <span>{t("add")}</span>
          </button>
        </div>
        <p className="small muted">
          {!user
            ? "Connexion requise pour le stock"
            : availability.error
              ? "Stock temporairement indisponible"
              : availability.data
                ? `${availability.data.available} disponibles · tous entrepôts`
                : "Vérification du stock…"}
        </p>
        <span role="status" className="small">
          {added ? "Ajouté au panier" : ""}
        </span>
      </div>
    </article>
  );
}
