import { describe, expect, it } from "vitest";
import { warehouseSites } from "./cityLayout";
import type { Warehouse } from "./worldModel";

const warehouse = (id: number, classification = "OPERATIONAL") =>
  ({ warehouse_id: id, name: `Warehouse ${id}`, classification }) as Warehouse;

describe("recorded city warehouse layout", () => {
  it("never invents a warehouse when a source is empty", () => {
    expect(warehouseSites([], 123)).toEqual([]);
  });
  it("caps buildings and preserves actual records on the same ground plane", () => {
    const records = Array.from({ length: 9 }, (_, i) => warehouse(i + 1));
    const sites = warehouseSites(records);
    expect(sites).toHaveLength(5);
    expect(
      sites.every((s) => records.includes(s.warehouse) && s.position[1] === 0),
    ).toBe(true);
    expect(new Set(sites.map((s) => s.position.join(","))).size).toBe(5);
  });
  it("places a selected test record in an annex without duplicating it", () => {
    const records = [
      ...Array.from({ length: 6 }, (_, i) => warehouse(i + 1)),
      warehouse(77, "TEST"),
    ];
    const sites = warehouseSites(records, 77);
    expect(sites.map((s) => s.warehouse.warehouse_id)).toEqual([
      1, 2, 3, 4, 77,
    ]);
    expect(
      warehouseSites(records, 3).map((s) => s.warehouse.warehouse_id),
    ).toEqual([1, 2, 3, 4, 5]);
  });
});
