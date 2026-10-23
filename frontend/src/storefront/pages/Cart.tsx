import { Link } from "react-router-dom";
import { useCart, estimate } from "../cart";
import { money } from "../../shared/utils";
import QuantityStepper from "../../shared/QuantityStepper";
import { ProductVisual } from "../components/ProductCard";
export default function Cart() {
  const { items, setQty, remove } = useCart();
  return (
    <div className="container page">
      <p className="eyebrow">VOTRE CONFIGURATION PREND FORME</p>
      <h1>Votre panier</h1>
      {items.length === 0 ? (
        <section className="empty">
          <h2>Votre panier est vide</h2>
          <p>Trouvez la première pièce de votre prochaine configuration.</p>
          <Link className="button primary" to="/shop">
            Explorer le catalogue
          </Link>
        </section>
      ) : (
        <div className="checkout-layout">
          <section>
            {items.map((i) => (
              <article className="cart-line" key={i.productId}>
                <ProductVisual category={i.category} />
                <div>
                  <h2>
                    <Link to={"/products/" + i.productId}>{i.name}</Link>
                  </h2>
                  <p>{money(i.priceCents)} · prix indicatif mémorisé</p>
                  <QuantityStepper
                    value={i.quantity}
                    onChange={(n) => setQty(i.productId, n)}
                  />
                  <button
                    className="text-button"
                    onClick={() => remove(i.productId)}
                  >
                    Retirer
                  </button>
                </div>
                <strong>{money(i.priceCents * i.quantity)}</strong>
              </article>
            ))}
          </section>
          <aside className="summary">
            <p className="eyebrow">RÉCAPITULATIF</p>
            <h2>Votre sélection</h2>
            <div className="total">
              <span>Sous-total estimé</span>
              <strong>{money(estimate(items))}</strong>
            </div>
            <p className="small muted">
              Les prix et le stock seront revalidés par le serveur. Aucun coupon
              ou frais de livraison non pris en charge n'est appliqué.
            </p>
            <Link className="button primary" to="/checkout">
              Vérifier et commander
            </Link>
            <Link to="/shop">Continuer mes achats</Link>
          </aside>
        </div>
      )}
    </div>
  );
}
