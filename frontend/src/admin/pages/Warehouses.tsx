import { useState } from "react";
import { request } from "../../api/client";
import { useResource } from "../../hooks/useResource";
import { State } from "../../shared/State";
type Warehouse = {
  warehouse_id: number;
  name: string;
  city: string;
  capacity_units: number;
  physical: number;
  reserved: number;
  available: number;
  utilization_percent: number | null;
  low_stock_count: number;
  classification: string;
};
export default function Warehouses() {
  const [include, setInclude] = useState(false);
  const data = useResource(
    () =>
      request<{ items: Warehouse[] }>(
        `/api/inventory/warehouses?include_test=${include}`,
      ),
    String(include),
    15000,
  );
  return (
    <section className="panel">
      <h2>Capacité des entrepôts</h2>
      <label className="ops-toggle">
        <input
          type="checkbox"
          checked={include}
          onChange={(e) => setInclude(e.target.checked)}
        />{" "}
        Inclure les entrepôts de test et archivés
      </label>
      <button className="button" onClick={data.retry}>
        Actualiser les entrepôts
      </button>
      <State {...data} />
      <div className="service-grid">
        {data.data?.items.map((w) => (
          <article className="service ops-card" key={w.warehouse_id}>
            <h3>{w.name}</h3>
            <p>
              {w.city} · {w.classification}
            </p>
            <p>
              Capacité :{" "}
              {w.capacity_units > 0
                ? `${w.capacity_units} unités physiques`
                : "Indisponible"}
            </p>
            <p>
              Utilisation :{" "}
              {w.utilization_percent === null
                ? "Indisponible"
                : `${w.utilization_percent} %`}
            </p>
            {w.utilization_percent !== null && w.utilization_percent > 90 && (
              <p role="status">Avertissement : saturation</p>
            )}
            <p>
              Physique : {w.physical} · Réservé : {w.reserved} · Disponible :{" "}
              {w.available}
            </p>
            <p>Références en stock faible : {w.low_stock_count}</p>
          </article>
        ))}
      </div>
      <p className="small muted">
        Utilisation = somme des unités physiques / capacité déclarée. Une
        capacité nulle ne permet pas de calculer un pourcentage.
      </p>
    </section>
  );
}
