import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useCart, estimate } from "../storefront/cart";
import ProductCard from "../storefront/components/ProductCard";
import QuantityStepper from "./QuantityStepper";
import { State } from "./State";
import { orderMessage } from "./orderStatus";
import { money } from "./utils";
import { AuthProvider, Protected, useAuth, isStaff } from "../auth/session";
import { request, setTokens, getTokens, ApiError } from "../api/client";
import "../shared/i18n";
import type { Product } from "../types";
import { numericProductId } from "../api/market";
const p: Product = {
  productId: "1001",
  name: "Test CPU",
  sku: "CPU-TEST",
  description: "Unit fixture",
  category: "CPU",
  brand: "Test",
  priceCents: 12999,
  currency: "EUR",
  active: true,
  attributes: { socket: "AM5" },
  publicationVersion: 2,
  publishedAt: "2026-10-23T00:00:00Z",
  validationStatus: "VALIDATED",
  sourceSystem: "UnoPim",
};
beforeEach(() => {
  useCart.getState().clear();
  setTokens(null);
  vi.restoreAllMocks();
});
afterEach(cleanup);
describe("Catalogue and cart", () => {
  it("preserves product identities and refuses unsafe integer rounding", () => {
    expect(numericProductId("1001")).toBe(1001);
    expect(() => numericProductId("9007199254740993")).toThrow();
    expect(() => numericProductId("invalid")).toThrow();
  });
  it("renders actual product fields and a non-deceptive generic illustration", () => {
    render(
      <MemoryRouter>
        <ProductCard product={p} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Test CPU" })).toBeVisible();
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /Illustration générique/,
    );
    expect(screen.queryByText(/reviews|livraison gratuite/i)).toBeNull();
  });
  it("adds a product from the card with accessible feedback", () => {
    render(
      <MemoryRouter>
        <ProductCard product={p} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ajouter Test CPU" }));
    expect(useCart.getState().items[0].quantity).toBe(1);
    expect(screen.getByRole("status")).toHaveTextContent("Ajouté au panier");
  });
  it("merges quantities without duplicating product lines", () => {
    useCart.getState().add(p);
    useCart.getState().add(p);
    expect(useCart.getState().items).toHaveLength(1);
    expect(useCart.getState().items[0].quantity).toBe(2);
  });
  it("keeps estimate as integer cents and never adds fake shipping or coupons", () => {
    useCart.getState().add(p);
    useCart.getState().setQty("1001", 3);
    expect(estimate(useCart.getState().items)).toBe(38997);
  });
  it("bounds cart quantities and removes a line", () => {
    useCart.getState().add(p);
    useCart.getState().setQty("1001", -4);
    expect(useCart.getState().items[0].quantity).toBe(1);
    useCart.getState().setQty("1001", 1000);
    expect(useCart.getState().items[0].quantity).toBe(99);
    useCart.getState().remove("1001");
    expect(useCart.getState().items).toEqual([]);
  });
  it("quantity stepper disables minimum and respects maximum", () => {
    const change = vi.fn();
    const { rerender } = render(
      <QuantityStepper value={1} max={2} onChange={change} />,
    );
    expect(screen.getByLabelText("Diminuer la quantité")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Augmenter la quantité"));
    expect(change).toHaveBeenCalledWith(2);
    rerender(<QuantityStepper value={2} max={2} onChange={change} />);
    expect(screen.getByLabelText("Augmenter la quantité")).toBeDisabled();
  });
  it("formats EUR from cents", () => {
    expect(money(12999).replaceAll("\u00a0", " ")).toContain("129,99");
    expect(money(0)).toContain("0,00");
  });
});
describe("Status and resource feedback", () => {
  it.each(["PENDING", "STOCK_RESERVED", "PAID"])(
    "never labels incomplete %s as failed",
    (status) => {
      expect(orderMessage(status, false)).toMatch(/Traitement en cours/);
      expect(orderMessage(status, false)).not.toMatch(/refusé/);
    },
  );
  it("shows a definitive declined payment only when complete", () =>
    expect(orderMessage("PAYMENT_FAILED", true)).toContain("Paiement refusé"));
  it("shows final success and refund distinctly", () => {
    expect(orderMessage("PAID", true)).toBe("Commande confirmée");
    expect(orderMessage("REFUNDED", true)).toBe("Commande remboursée");
  });
  it("announces loading without displaying fake products", () => {
    render(<State loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Chargement");
  });
  it("provides retry on API error", () => {
    const retry = vi.fn();
    render(<State error="Service indisponible" retry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Service indisponible");
    fireEvent.click(screen.getByText("Réessayer"));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("explains an empty catalogue", () => {
    render(<State empty />);
    expect(screen.getByText("Aucun résultat")).toBeVisible();
  });
});
describe("Session and API safety", () => {
  it("redirects anonymous protected navigation", () => {
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <Protected admin>
                  <p>Secret</p>
                </Protected>
              }
            />
            <Route path="/login" element={<p>Login route</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByText("Secret")).toBeNull();
  });
  it("maps staff/admin capability without granting customer access", () => {
    expect(isStaff({ roles: ["customer"] } as never)).toBe(false);
    expect(isStaff({ roles: ["staff"] } as never)).toBe(true);
    expect(isStaff({ roles: ["admin"] } as never)).toBe(true);
  });
  it("keeps authentication secrets out of local/session storage", () => {
    setTokens({
      access_token: "access-sensitive",
      refresh_token: "refresh-sensitive",
      expires_in: 10,
    });
    expect(JSON.stringify(localStorage)).not.toContain("sensitive");
    expect(JSON.stringify(sessionStorage)).not.toContain("sensitive");
  });
  it("normalizes backend authentication errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: "UNAUTHENTICATED", message: "secret internal" },
          }),
          { status: 401 },
        ),
      ),
    );
    await expect(request("/api/auth/login", {}, false)).rejects.toThrow(
      "Session expirée",
    );
  });
  it("refreshes concurrent 401s once and retries with rotated credentials", async () => {
    setTokens({
      access_token: "old",
      refresh_token: "opaque-token",
      expires_in: 1,
    });
    let refreshes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, options: RequestInit) => {
        if (path.includes("/refresh")) {
          refreshes++;
          await new Promise((r) => setTimeout(r, 5));
          return new Response(
            JSON.stringify({
              access_token: "new",
              refresh_token: "rotated",
              expires_in: 900,
            }),
          );
        }
        if (
          (options.headers as Record<string, string>).Authorization ===
          "Bearer old"
        )
          return new Response("{}", { status: 401 });
        return new Response('{"ok":true}');
      }),
    );
    const responses = await Promise.all([
      request("/api/orders"),
      request("/api/orders"),
    ]);
    expect(refreshes).toBe(1);
    expect(responses).toEqual([{ ok: true }, { ok: true }]);
    expect(getTokens()?.access_token).toBe("new");
  });
  it("clears revoked sessions when refresh fails", async () => {
    setTokens({
      access_token: "revoked",
      refresh_token: "invalid-token",
      expires_in: 1,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
    );
    await expect(request("/api/orders")).rejects.toBeInstanceOf(ApiError);
    expect(getTokens()).toBeNull();
  });
  it("calls real auth contract shape and clears local session on logout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (path: string) =>
          new Response(
            JSON.stringify(
              path.endsWith("/login")
                ? {
                    access_token: "token",
                    refresh_token: "opaque",
                    expires_in: 900,
                  }
                : path.endsWith("/me")
                  ? {
                      user_id: 1,
                      username: "unit",
                      email: "unit@example.test",
                      first_name: "Unit",
                      last_name: "Test",
                      roles: ["customer"],
                    }
                  : { status: "revoked" },
            ),
          ),
      ),
    );
    function Controls() {
      const { user, login, logout } = useAuth();
      return (
        <>
          <span>{user?.first_name ?? "Anonymous"}</span>
          <button onClick={() => void login("unit", "password")}>Login</button>
          <button onClick={() => void logout()}>Logout</button>
        </>
      );
    }
    render(
      <AuthProvider>
        <Controls />
      </AuthProvider>,
    );
    fireEvent.click(screen.getByText("Login"));
    await waitFor(() => expect(screen.getByText("Unit")).toBeVisible());
    fireEvent.click(screen.getByText("Logout"));
    await waitFor(() => expect(screen.getByText("Anonymous")).toBeVisible());
    expect(getTokens()).toBeNull();
  });
});
