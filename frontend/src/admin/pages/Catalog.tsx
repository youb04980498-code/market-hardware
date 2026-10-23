import { useState } from "react";
import { Link } from "react-router-dom";
import { products } from "../../api/market";
import { useResource } from "../../hooks/useResource";
import { State } from "../../shared/State";
import { money } from "../../shared/utils";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "../../shared/table";
export default function Catalog() {
  const [page, setPage] = useState(1);
  const data = useResource(
    () => products({ page, pageSize: 20 }),
    String(page),
  );
  return (
    <div className="admin-page">
      <p className="eyebrow">PROJECTION APPROUVÉE · GRAPHQL</p>
      <h1>Catalogue publié</h1>
      <section className="notice">
        <strong>UnoPim est le référentiel produit.</strong>
        <p>
          Les descriptions et attributs s'éditent dans UnoPim. Cette interface
          ne modifie jamais les projections MongoDB ou Neo4j.
        </p>
        <p>
          Le statut global de synchronisation n'est pas exposé par une API
          approuvée ; seules les versions publiées sont présentées.
        </p>
      </section>
      <State {...data} />
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "Produit",
              "Catégorie",
              "Prix",
              "Publication",
              "Validation",
              "Source",
            ].map((s) => (
              <TableHead key={s}>{s}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.data?.items.map((p) => (
            <TableRow key={p.productId}>
              <TableCell>
                <Link to={"/products/" + p.productId}>{p.name}</Link>
                <small>
                  {p.sku} · #{p.productId}
                </small>
              </TableCell>
              <TableCell>{p.category}</TableCell>
              <TableCell>{money(p.priceCents)}</TableCell>
              <TableCell>
                v{p.publicationVersion}
                <small>
                  {new Date(p.publishedAt).toLocaleDateString("fr-FR")}
                </small>
              </TableCell>
              <TableCell>{p.validationStatus}</TableCell>
              <TableCell>{p.sourceSystem}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <nav className="pagination">
        <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          Précédent
        </button>
        <span>Page {page}</span>
        <button
          disabled={!data.data?.hasNext}
          onClick={() => setPage((p) => p + 1)}
        >
          Suivant
        </button>
      </nav>
    </div>
  );
}
