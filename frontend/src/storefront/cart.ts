// Adapted from ecommerce-react stores/cart.ts: persisted Zustand cart. Demo coupons/shipping removed.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "../types";
export interface CartItem {
  productId: string;
  name: string;
  category: string;
  priceCents: number;
  quantity: number;
}
interface Cart {
  items: CartItem[];
  add: (p: Product) => void;
  setQty: (id: string, n: number) => void;
  remove: (id: string) => void;
  clear: () => void;
}
export const estimate = (items: CartItem[]) =>
  items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);
export const useCart = create<Cart>()(
  persist(
    (set) => ({
      items: [],
      add: (p) =>
        set((s) => {
          const exists = s.items.some((i) => i.productId === p.productId);
          return {
            items: exists
              ? s.items.map((i) =>
                  i.productId === p.productId
                    ? { ...i, quantity: Math.min(99, i.quantity + 1) }
                    : i,
                )
              : [
                  ...s.items,
                  {
                    productId: p.productId,
                    name: p.name,
                    category: p.category,
                    priceCents: p.priceCents,
                    quantity: 1,
                  },
                ],
          };
        }),
      setQty: (id, n) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.productId === id
              ? {
                  ...i,
                  quantity: Math.max(1, Math.min(99, Math.trunc(n) || 1)),
                }
              : i,
          ),
        })),
      remove: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.productId !== id) })),
      clear: () => set({ items: [] }),
    }),
    { name: "market-cart-v1" },
  ),
);
