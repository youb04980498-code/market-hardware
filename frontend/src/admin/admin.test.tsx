import { describe, it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { DateRange, ResourceState } from "./components";
import { needsReview, metric } from "./data";
import { Lifecycle } from "./pages/Orders";
import { useAdminResource } from "./useAdminResource";
import type { Order } from "../types";
afterEach(cleanup);
describe("administration decisions", () => {
  it("does not classify compensated terminal orders as unresolved", () => {
    const old = "2026-01-01T00:00:00Z";
    expect(needsReview({ status: "PAYMENT_FAILED", created_at: old })).toBe(
      false,
    );
    expect(needsReview({ status: "REFUNDED", created_at: old })).toBe(false);
    expect(
      needsReview(
        { status: "PENDING", created_at: old },
        Date.parse("2026-01-01T00:16:00Z"),
      ),
    ).toBe(true);
  });
  it("does not convert missing or NaN monitoring samples into zero", () => {
    expect(metric(null)).toBeUndefined();
    expect(metric([{ metric: {}, value: [0, "NaN"] }])).toBeUndefined();
    expect(
      metric([{ metric: { service: "orders" }, value: [0, "0"] }], "orders"),
    ).toBe(0);
    expect(
      metric([{ metric: { service: "auth" }, value: [0, "1"] }], "orders"),
    ).toBeUndefined();
  });
  it("renders compensation as completed without inventing shipment stages", () => {
    const o = {
      created_at: "2026-01-01T00:00:00Z",
      status: "PAYMENT_FAILED",
      complete: true,
      saga: { step: "DONE" },
    } as Order;
    render(<Lifecycle o={o} />);
    expect(screen.getByText("Compensation terminée")).toBeInTheDocument();
    expect(
      screen.getByText(/Paiement refusé · commande compensée/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Commande expédiée")).not.toBeInTheDocument();
  });
  it("applies an explicit UTC calendar range with exclusive end", () => {
    const change = vi.fn();
    render(
      <DateRange
        value={{ from: "2026-05-01", to: "2026-05-10" }}
        onChange={change}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /2026-05-01/ }));
    fireEvent.click(screen.getByRole("button", { name: "2026-05-03" }));
    fireEvent.click(screen.getByRole("button", { name: "2026-05-07" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Appliquer la période" }),
    );
    expect(change).toHaveBeenCalledWith({
      from: "2026-05-03",
      to: "2026-05-07",
    });
  });
  it("shows refresh errors even while old data is retained", () => {
    render(<ResourceState data={{ count: 4 }} error="Hors ligne" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Hors ligne");
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
describe("admin request lifecycle", () => {
  function Harness({
    load,
    id = "a",
  }: {
    load: () => Promise<number>;
    id?: string;
  }) {
    const r = useAdminResource(load, id);
    return (
      <>
        <output>{r.data ?? "unknown"}</output>
        {r.error && <p role="alert">{r.error}</p>}
        <button onClick={r.retry}>Refresh</button>
      </>
    );
  }
  it("retains last success when manual refresh fails", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(17)
      .mockRejectedValueOnce(new Error("Network unavailable"));
    render(<Harness load={load} />);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("17"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("status")).toHaveTextContent("17");
  });
  it("discards responses from obsolete selections", async () => {
    let resolveOld!: (v: number) => void;
    const old = new Promise<number>((resolve) => (resolveOld = resolve));
    const view = render(<Harness load={() => old} />);
    view.rerender(<Harness id="b" load={() => Promise.resolve(29)} />);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("29"),
    );
    resolveOld(10);
    await Promise.resolve();
    expect(screen.getByRole("status")).toHaveTextContent("29");
  });
});
