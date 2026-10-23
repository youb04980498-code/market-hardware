import { graphql, request } from "./client";
import type {
  Product,
  ProductPage,
  Order,
  OrderPage,
  CartBody,
  ValidatedCart,
  Stock,
  WarehouseStock,
  Payment,
} from "../types";
export function numericProductId(id: string): number {
  const value = Number(id);
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(value) || value < 1)
    throw new Error(
      "Identifiant produit non représentable sans perte dans ce navigateur.",
    );
  return value;
}
const fields =
  "productId sku name description brand category priceCents currency active attributes publicationVersion publishedAt validationStatus sourceSystem";
export const products = (variables: Record<string, unknown> = {}) =>
  graphql<{ products: ProductPage }>(
    `query($search:String,$category:Category,$brand:String,$page:Int!,$pageSize:Int!,$minPriceCents:Int,$maxPriceCents:Int){products(search:$search,category:$category,brand:$brand,page:$page,pageSize:$pageSize,minPriceCents:$minPriceCents,maxPriceCents:$maxPriceCents){items{${fields}}total page pageSize hasNext}}`,
    { page: 1, pageSize: 12, ...variables },
  ).then((r) => r.products);
export const product = (id: string) =>
  graphql<{ product: Product | null }>(
    `query($id:ID!){product(productId:$id){${fields}}}`,
    { id },
  ).then((r) => r.product);
export const brands = () =>
  graphql<{ brands: string[] }>("{brands}").then((r) => r.brands);
export const compatibility = (id: string) =>
  graphql<{
    compatibleProducts: {
      product: Product;
      rule: string;
      ruleVersion: string;
      provenance: string;
      validationStatus: string;
    }[];
  }>(
    `query($id:ID!){compatibleProducts(productId:$id){product{${fields}}rule ruleVersion provenance validationStatus}}`,
    { id },
  ).then((r) => r.compatibleProducts);
export const stock = (id: string) =>
  request<Stock>("/api/inventory/products/" + id);
export const warehouses = (id: string) =>
  request<{ items: WarehouseStock[] }>(
    "/api/inventory/products/" + id + "/warehouses",
  ).then((r) => r.items);
export const orders = (page = 1, admin = false) =>
  request<OrderPage>(
    `/api/orders?page=${page}&page_size=20&all_customers=${admin}`,
  );
export const order = (id: string) => request<Order>("/api/orders/" + id);
export const validateCart = (body: CartBody) =>
  request<ValidatedCart>("/api/orders/cart/validate", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const checkout = (body: CartBody, key: string) =>
  request<Order>("/api/orders", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
export const payment = (id: number) => request<Payment>("/api/payments/" + id);
export const categories = [
  "CPU",
  "MOTHERBOARD",
  "RAM",
  "GPU",
  "SSD",
  "PSU",
  "CASE",
  "COOLER",
];
export const labels: Record<string, string> = {
  CPU: "Processeurs",
  MOTHERBOARD: "Cartes mères",
  RAM: "Mémoire vive",
  GPU: "Cartes graphiques",
  SSD: "Stockage SSD",
  PSU: "Alimentations",
  CASE: "Boîtiers",
  COOLER: "Refroidissement",
  PERIPHERAL: "Périphériques",
};
