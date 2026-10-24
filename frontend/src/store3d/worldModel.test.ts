import { describe, it, expect } from "vitest";
import { canRepresentCheckout, orderPosition, parseSse } from "./worldModel";
describe("read-only world representations", () => {
  it("parses reconnect/heartbeat frames without treating payloads as business state", () => {
    expect(parseSse(": heartbeat\n")).toBeNull();
    expect(
      parseSse(
        'event: resync\r\ndata: {"revision":3,"broker_connected":false}\r\n',
      )?.data.revision,
    ).toBe(3);
    expect(() => parseSse("data: not-json")).toThrow();
  });
  it("uses recorded statuses and preserves distinct shipping/delivered stages", () => {
    expect(canRepresentCheckout("PENDING")).toBe(true);
    expect(canRepresentCheckout("DELIVERED")).toBe(false);
    expect(canRepresentCheckout("INVENTED")).toBe(false);
    expect(orderPosition("PAID", 1)[0]).toBeLessThan(
      orderPosition("SHIPPED", 1)[0],
    );
    expect(orderPosition("SHIPPED", 1)[0]).toBeLessThan(
      orderPosition("DELIVERED", 1)[0],
    );
    expect(orderPosition("PAID", 1)).toEqual(orderPosition("PAID", 1));
  });
});
