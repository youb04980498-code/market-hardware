import type { Warehouse } from "./worldModel";
export type WarehouseSite = {
  warehouse: Warehouse;
  position: [number, number, number];
};

export function warehouseSites(
  warehouses: Warehouse[],
  selectedId?: number,
): WarehouseSite[] {
  const operational = warehouses
    .filter((w) => w.classification === "OPERATIONAL")
    .slice(0, 5);
  const selected = warehouses.find((w) => w.warehouse_id === selectedId);
  const visible =
    selected && !operational.some((w) => w.warehouse_id === selectedId)
      ? [...operational.slice(0, 4), selected]
      : operational;
  const positions: [number, number, number][] = [
    [10, 0, -23],
    [25, 0, -23],
    [17.5, 0, -10.5],
    [32, 0, -10.5],
    [32, 0, -23],
  ];
  return visible.map((warehouse, i) => ({ warehouse, position: positions[i] }));
}
