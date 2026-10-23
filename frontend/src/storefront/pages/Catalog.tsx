import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  SlidersHorizontal,
  Cpu,
  Layers,
  Gpu,
  HardDrive,
  MemoryStick,
  Box,
  Zap,
  Fan,
} from "lucide-react";
import { products, brands, categories, labels } from "../../api/market";
import { useResource } from "../../hooks/useResource";
import ProductCard from "../components/ProductCard";
import { State } from "../../shared/State";
const icons = [Cpu, Layers, MemoryStick, Gpu, HardDrive, Zap, Box, Fan];
export default function Catalog({ home = false }: { home?: boolean }) {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "";
  const search = params.get("search") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const query = {
    search: search || null,
    category: category || null,
    brand: params.get("brand") || null,
    page,
    pageSize: home ? 4 : 12,
    minPriceCents: params.get("min") ? Number(params.get("min")) * 100 : null,
    maxPriceCents: params.get("max") ? Number(params.get("max")) * 100 : null,
  };
  const result = useResource(() => products(query), JSON.stringify(query));
  const brandList = useResource(brands, "brands");
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }
  return (
    <>
      {home && (
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow hero-label">
              POUR CEUX QUI ASSEMBLENT LEUR DIFFÉRENCE
            </span>
            <h1>
              La performance
              <br />
              commence par
              <br />
              <em>le bon composant.</em>
            </h1>
            <p>
              Du premier processeur à la dernière vis.
              <br />
              Composez votre prochain PC, pièce par pièce.
            </p>
            <Link className="button primary" to="/shop">
              Explorer les composants <ArrowRight size={18} />
            </Link>
            <div className="hero-note">
              <span className="status-dot" />
              Produits approuvés et spécifications vérifiées
            </div>
          </div>
          <div
            className="hero-machine"
            aria-label="Illustration de composants PC"
            role="img"
          >
            <div className="board-art">
              <div className="board-line one" />
              <div className="board-line two" />
              <div className="cpu-art">
                <span>MH</span>
                <strong>
                  BUILD
                  <br />
                  YOUR NEXT.
                </strong>
              </div>
              <div className="ram-art" />
              <div className="ram-art second" />
              <div className="fan-art" />
              <small>MARKET HARDWARE / COMPONENT SERIES</small>
            </div>
            <div className="floating-label">
              <span className="status-dot" />
              Votre prochaine configuration commence ici.
            </div>
          </div>
        </section>
      )}
      <div className="container">
        <section className="category-section">
          <div className="section-head">
            <div>
              <p className="eyebrow">CHAQUE PIÈCE A SON RÔLE</p>
              <h2>Au cœur de votre configuration</h2>
            </div>
            {home && (
              <Link className="arrow-link" to="/shop">
                Tout le catalogue <ArrowRight size={17} />
              </Link>
            )}
          </div>
          <div className="category-grid">
            {categories.map((c, i) => {
              const Icon = icons[i];
              return (
                <Link
                  className={
                    "category-tile " + (category === c ? "selected" : "")
                  }
                  to={"/shop?category=" + c}
                  key={c}
                >
                  <Icon size={26} />
                  <span>{labels[c]}</span>
                </Link>
              );
            })}
          </div>
        </section>
        <section className="catalog-section">
          <div className="section-head">
            <div>
              <p className="eyebrow">CATALOGUE EN DIRECT</p>
              <h2>
                {home
                  ? "À découvrir, pièce par pièce"
                  : "Les composants pour votre prochain PC"}
              </h2>
            </div>
            {result.data && (
              <span className="pill">{result.data.total} produits publiés</span>
            )}
          </div>
          <form
            className="filters"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              filter("search", String(data.get("search") ?? ""));
            }}
          >
            <label className="search-field">
              <span>Rechercher</span>
              <input
                key={search}
                name="search"
                defaultValue={search}
                placeholder="Processeur, carte graphique, référence…"
              />
            </label>
            <button type="submit" className="primary">
              Rechercher
            </button>
            {!home && (
              <>
                <label>
                  Catégorie
                  <select
                    value={category}
                    onChange={(e) => filter("category", e.target.value)}
                  >
                    <option value="">Toutes les catégories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {labels[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Marque
                  <select
                    value={params.get("brand") ?? ""}
                    onChange={(e) => filter("brand", e.target.value)}
                  >
                    <option value="">Toutes les marques</option>
                    {brandList.data?.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Prix maximum (€)
                  <input
                    type="number"
                    min="0"
                    value={params.get("max") ?? ""}
                    onChange={(e) => filter("max", e.target.value)}
                  />
                </label>
              </>
            )}
          </form>
          <p className="small muted filter-note">
            <SlidersHorizontal size={14} />
            Ordre de publication du catalogue. Aucun tri serveur par prix
            disponible.
          </p>
          <State {...result} empty={result.data?.items.length === 0} />
          <div className={home ? "product-grid featured-grid" : "product-grid"}>
            {result.data?.items.map((p) => (
              <ProductCard key={p.productId} product={p} />
            ))}
          </div>
          {!home && result.data && (
            <nav className="pagination" aria-label="Pagination du catalogue">
              <button
                disabled={page <= 1}
                onClick={() => filter("page", String(page - 1))}
              >
                Précédent
              </button>
              <span>Page {page}</span>
              <button
                disabled={!result.data.hasNext}
                onClick={() => filter("page", String(page + 1))}
              >
                Suivant
              </button>
            </nav>
          )}
        </section>
        {home && (
          <section className="builder-banner">
            <div>
              <p className="eyebrow">VOTRE IDÉE. VOTRE CONFIGURATION.</p>
              <h2>Un PC à votre mesure.</h2>
              <p>
                Le configurateur et ses vérifications de compatibilité arrivent
                en phase 7.
              </p>
            </div>
            <Link className="button" to="/pc-builder">
              Découvrir le PC Builder <ArrowRight size={18} />
            </Link>
          </section>
        )}
      </div>
    </>
  );
}
