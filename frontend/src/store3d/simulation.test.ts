import { describe, expect, it } from "vitest";
import { poseAt, shoppers } from "./simulation";

describe("isolated storefront simulation", () => {
  it("keeps checkout customers in their fixed queue without processing anything", () => {
    for (const shopper of shoppers.filter(
      (s) => s.activity === "Checkout Queue",
    )) {
      expect(poseAt(shopper, 0)).toEqual(poseAt(shopper, 10000));
      expect(poseAt(shopper, 10000).moving).toBe(false);
    }
  });
  it("moves continuously through aisles, stops to browse, and stays on the shop floor", () => {
    const shopper = shoppers[0];
    expect(poseAt(shopper, 1).z).toBeCloseTo(-1.22);
    expect(poseAt(shopper, 7)).toMatchObject({
      x: -7.5,
      moving: false,
    });
    expect(poseAt(shopper, 7).z).toBeCloseTo(-3.9);
    expect(poseAt(shopper, 11).x).toBeGreaterThan(-7.5);
    for (const s of shoppers)
      for (let t = 0; t < 300; t += 0.25) {
        const a = poseAt(s, t),
          b = poseAt(s, t + 0.01);
        expect(Math.abs(a.x)).toBeLessThan(9);
        expect(Math.abs(a.z)).toBeLessThan(6);
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.01);
      }
  });
  it("is deterministic when the simulation clock is paused or restored", () => {
    const snapshot = shoppers.map((s) => poseAt(s, 42));
    expect(shoppers.map((s) => poseAt(s, 42))).toEqual(snapshot);
    expect(shoppers.map((s) => poseAt(s, 44))).not.toEqual(snapshot);
  });
});
