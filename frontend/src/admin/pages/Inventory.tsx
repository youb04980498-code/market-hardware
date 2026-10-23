import { useState } from "react";
import { products, warehouses } from "../../api/market";
import { useResource } from "../../hooks/useResource";
import { State } from "../../shared/State";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "../../shared/table";
export default function Inventory() {
  const [pid, setPid] = useState("1001");
  const catalog = useResource(
    () => products({ pageSize: 100 }),
    "stock-products",
  );
  const data = useResource(() => warehouses(pid), pid, 10000);
  return (
    <div className="admin-page">
      <p className="eyebrow">SOURCE : INVENTORY REST</p>
      <h1>Inventaire</h1>
      <label className="inventory-select">
        Produit
        <select value={pid} onChange={(e) => setPid(e.target.value)}>
          {catalog.data?.items.map((p) => (
            <option value={p.productId} key={p.productId}>
              {p.name} · #{p.productId}
            </option>
          ))}
        </select>
      </label>
      <State {...catalog} />
      <State {...data} empty={data.data?.length === 0} />
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "Entrepôt",
              "Ville",
              "Physique",
              "Réservé",
              "Disponible",
              "Disponibilité",
            ].map((s) => (
              <TableHead key={s}>{s}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.data?.map((w) => (
            <TableRow key={w.warehouse_id}>
              <TableCell>
                {w.name}
                <small>#{w.warehouse_id}</small>
              </TableCell>
              <TableCell>{w.city}</TableCell>
              <TableCell>{w.quantity}</TableCell>
              <TableCell>{w.reserved_quantity}</TableCell>
              <TableCell>{w.available}</TableCell>
              <TableCell>
                <span className="pill">
                  {w.available === 0
                    ? "Rupture"
                    : w.available < 5
                      ? "Stock faible"
                      : "Disponible"}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <section className="notice">
        <h2>Lecture du stock</h2>
        <p>
          Disponible = physique − réservé. Les unités déjà allouées ne sont plus
          dans le stock physique ; aucun compteur de stock engagé historique
          n'est exposé.
        </p>
        <p>
          Cette vue est volontairement en lecture seule. Les mutations
          privilégiées restent protégées par l'API et ne sont pas nécessaires à
          cette phase.
        </p>
      </section>
    </div>
  );
}
