import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Box, ExternalLink } from "lucide-react";
import { warehouses, labels } from "../../api/market";
import { request } from "../../api/client";
import { money } from "../../shared/utils";
import {
  allProducts,
  stockSnapshot,
  warehouseList,
  integer,
  dateTime,
} from "../data";
import { useAdminResource } from "../useAdminResource";
import {
  PageHeader,
  Kpi,
  Panel,
  Refresh,
  Freshness,
  ResourceState,
  Tabs,
  Pagination,
  Drawer,
  Fact,
  Badge,
} from "../components";
import type { Product } from "../../types";
type PimStatus = {
  author_total: number | null;
  managed_total: number | null;
  unapproved_total: number | null;
  published_active: number;
  published_inactive: number;
  pending_jobs: number;
  publication_errors: number | null;
  pim_observed_at: string | null;
  pim_connected: boolean;
  worker_healthy: boolean;
  stale: boolean;
};
function ProductDetail({ p, onClose }: { p: Product; onClose: () => void }) {
  const stock = useAdminResource(() => warehouses(p.productId), p.productId);
  return (
    <Drawer
      title={p.name}
      subtitle={`${p.sku} · #${p.productId}`}
      onClose={onClose}
    >
      <div className="drawer-section">
        <h3>Description publiée</h3>
        <p>{p.description || "Description indisponible."}</p>
      </div>
      <div>
        <Fact label="Catégorie" value={labels[p.category] || p.category} />
        <Fact label="Prix publié" value={money(p.priceCents)} />
        <Fact
          label="Publication"
          value={<Badge value="Publiée" tone="good" />}
        />
        <Fact label="Version" value={"v" + p.publicationVersion} />
        <Fact label="Dernière publication" value={dateTime(p.publishedAt)} />
        <Fact
          label="Dernière synchronisation"
          value="Non exposée par le catalogue"
        />
        <Fact label="Validation" value={p.validationStatus} />
        <Fact label="Source" value={p.sourceSystem} />
      </div>
      <div className="drawer-section">
        <h3>Spécifications techniques</h3>
        {Object.entries(p.attributes).map(([k, v]) => (
          <Fact
            key={k}
            label={k.replaceAll("_", " ")}
            value={typeof v === "object" ? JSON.stringify(v) : String(v)}
          />
        ))}
      </div>
      <div className="drawer-section">
        <h3>Stock actuel par entrepôt</h3>
        <ResourceState {...stock} />
        {stock.data?.map((w) => (
          <Fact
            key={w.warehouse_id}
            label={w.name}
            value={`${integer(w.available)} disponibles · ${integer(w.reserved_quantity)} réservés`}
          />
        ))}
      </div>
      <div className="drawer-section">
        <h3>Gouvernance de publication</h3>
        <p>
          Cette projection contient les produits approuvés et actifs. Les
          détails des brouillons et validations restent dans UnoPim. Les
          modifications restent gouvernées dans UnoPim.
        </p>
        <Link className="admin-button" to={"/products/" + p.productId}>
          Voir dans la boutique <ExternalLink size={13} />
        </Link>
      </div>
    </Drawer>
  );
}
export default function Catalog() {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [stockStatus, setStockStatus] = useState(""),
    [publication, setPublication] = useState(""),
    [sort, setSort] = useState("name"),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<Product>();
  const catalog = useAdminResource(allProducts, "published-catalog");
  const pim = useAdminResource(
    () => request<PimStatus>("/api/catalog/operations"),
    "pim-operations",
    30000,
  );
  const snapshot = useAdminResource(
    async () => ({
      stock: await stockSnapshot(),
      warehouses: await warehouseList(),
    }),
    "catalog-stock",
  );
  const quantities = new Map<string, number>();
  snapshot.data?.stock.data.items
    .filter((r) =>
      snapshot.data?.warehouses.items.some(
        (w) =>
          w.warehouse_id === r.warehouse_id &&
          w.classification === "OPERATIONAL",
      ),
    )
    .forEach((r) =>
      quantities.set(
        String(r.product_id),
        (quantities.get(String(r.product_id)) || 0) + r.available,
      ),
    );
  const list = catalog.data || [];
  const cats = [...new Set(list.map((p) => p.category))];
  const filtered = list
    .filter(
      (p) =>
        (!category || p.category === category) &&
        (!search ||
          `${p.name} ${p.sku}`
            .toLocaleLowerCase("fr")
            .includes(search.toLocaleLowerCase("fr"))) &&
        (!publication || publication === "published") &&
        (!stockStatus ||
          (quantities.has(p.productId) &&
            (stockStatus === "out"
              ? quantities.get(p.productId) === 0
              : stockStatus === "low"
                ? (quantities.get(p.productId) || 0) > 0 &&
                  (quantities.get(p.productId) || 0) <= 5
                : (quantities.get(p.productId) || 0) > 5))),
    )
    .sort((a, b) =>
      sort === "price"
        ? a.priceCents - b.priceCents
        : sort === "recent"
          ? b.publishedAt.localeCompare(a.publishedAt)
          : a.name.localeCompare(b.name, "fr"),
    );
  function change(fn: () => void) {
    fn();
    setPage(1);
  }
  return (
    <div className="admin-page">
      <PageHeader
        tag="PRODUCT OPERATIONS / CATALOGUE"
        title="Catalogue produits"
        subtitle="Gérez vos produits et leur publication."
      >
        <Refresh
          loading={catalog.loading}
          onClick={() => {
            catalog.retry();
            pim.retry();
            snapshot.retry();
          }}
        />
      </PageHeader>
      <Freshness at={catalog.at} error={catalog.error} />
      <ResourceState {...catalog} />
      <ResourceState {...pim} />
      <div className="kpi-strip">
        <Kpi
          label="Total produits PIM"
          value={pim.data && integer(pim.data.author_total)}
          note="Source UnoPim · actifs et inactifs inclus"
        />
        <Kpi
          label="Produits publiés"
          value={catalog.data && integer(list.length)}
          note="Projection approuvée et active"
        />
        <Kpi
          label="En attente de synchronisation"
          value={pim.data && integer(pim.data.pending_jobs)}
          note="Jobs PENDING persistés · hors brouillons"
        />
        <Kpi
          label="Erreurs de publication"
          value={pim.data && integer(pim.data.publication_errors)}
          note="Produits en erreur courante · hors historique"
        />
      </div>
      {pim.data && (
        <div className="insights-line">
          <Badge
            value={
              pim.data.stale
                ? "Observation PIM ancienne"
                : pim.data.pim_connected
                  ? "UnoPim connecté"
                  : "Connexion à vérifier"
            }
            tone={pim.data.stale ? "warn" : "good"}
          />
          <span>
            Dernière lecture PIM :{" "}
            <strong>{dateTime(pim.data.pim_observed_at)}</strong>
          </span>
          <span>
            Worker :{" "}
            <strong>
              {pim.data.worker_healthy ? "Opérationnel" : "À vérifier"}
            </strong>
          </span>
          <span>
            Non approuvés :{" "}
            <strong>{integer(pim.data.unapproved_total)}</strong> · projections
            inactives conservées :{" "}
            <strong>{integer(pim.data.published_inactive)}</strong>
          </span>
        </div>
      )}
      <Tabs
        label="Catégories catalogue"
        value={category}
        onChange={(v) => change(() => setCategory(v))}
        tabs={[
          { id: "", label: "Tous les produits", count: list.length },
          ...cats.map((c) => ({
            id: c,
            label: labels[c] || c,
            count: list.filter((p) => p.category === c).length,
          })),
        ]}
      />
      <Panel
        title="Produits prêts à vendre"
        description="Informations publiées · stock opérationnel au dernier snapshot"
      >
        <div className="filterbar">
          <label className="search-field">
            Rechercher
            <div>
              <Search size={14} />
              <input
                value={search}
                onChange={(e) => change(() => setSearch(e.target.value))}
                placeholder="Nom du produit ou SKU"
              />
            </div>
          </label>
          <label>
            Publication
            <select
              aria-label="Publication"
              value={publication}
              onChange={(e) => change(() => setPublication(e.target.value))}
            >
              <option value="">Toutes les publications accessibles</option>
              <option value="published">Publiés</option>
            </select>
          </label>
          <label>
            Stock
            <select
              value={stockStatus}
              onChange={(e) => change(() => setStockStatus(e.target.value))}
            >
              <option value="">Tous les stocks</option>
              <option value="available">Disponible &gt; 5</option>
              <option value="low">Faible : 1 à 5</option>
              <option value="out">Rupture</option>
            </select>
          </label>
          <label>
            Trier par
            <select
              value={sort}
              onChange={(e) => change(() => setSort(e.target.value))}
            >
              <option value="name">Nom du produit</option>
              <option value="price">Prix croissant</option>
              <option value="recent">Publication récente</option>
            </select>
          </label>
        </div>
        <div className="inline-note">
          <Freshness
            meta={snapshot.data?.stock.metadata}
            at={snapshot.at}
            error={snapshot.error}
          />
        </div>
        <ResourceState error={snapshot.error} retry={snapshot.retry} />
        <div className="command-table">
          <table>
            <thead>
              <tr>
                {[
                  "Produit",
                  "SKU",
                  "Catégorie",
                  "Prix",
                  "Stock disponible",
                  "Publication",
                  "Action",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice((page - 1) * 10, page * 10).map((p) => (
                <tr key={p.productId}>
                  <td>
                    <div className="product-identity">
                      <span
                        className="product-placeholder"
                        title="Image non fournie"
                      >
                        <Box size={17} />
                      </span>
                      <div>
                        <button
                          className="row-link"
                          onClick={() => setSelected(p)}
                        >
                          {p.name}
                        </button>
                        <small>
                          {p.brand} · #{p.productId}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>{p.sku}</td>
                  <td>{labels[p.category] || p.category}</td>
                  <td className="numeric">{money(p.priceCents)}</td>
                  <td className="numeric">
                    {snapshot.data ? integer(quantities.get(p.productId)) : "—"}
                  </td>
                  <td>
                    <Badge value="Publiée" tone="good" />
                    <small>v{p.publicationVersion}</small>
                  </td>
                  <td>
                    <button
                      aria-label={"Détail " + p.name}
                      onClick={() => setSelected(p)}
                    >
                      Examiner
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ResourceState empty={!catalog.loading && !filtered.length} />
        <Pagination page={page} total={filtered.length} onChange={setPage} />
      </Panel>
      <p className="inline-note">
        UnoPim demeure le référentiel auteur. Aucun accès d’écriture aux
        projections MongoDB/Neo4j. Aucun visuel produit n’est inventé ; l’icône
        indique une image absente.
      </p>
      {selected && (
        <ProductDetail p={selected} onClose={() => setSelected(undefined)} />
      )}
    </div>
  );
}
