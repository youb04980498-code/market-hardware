import AxeBuilder from "@axe-core/playwright";
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { parse } from "dotenv";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
const config = parse(readFileSync(resolve("..", ".env")));
const base = process.env.FRONTEND_URL ?? "http://127.0.0.1:8080";
let adminToken: string,
  customerToken: string,
  userId: number,
  warehouse: number;
async function api(
  request: APIRequestContext,
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  key?: string,
) {
  const response = await request.fetch(base + path, {
    method,
    data: body,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
  });
  if (!response.ok())
    throw new Error(`${method} ${path} returned ${response.status()}`);
  return response.json();
}
async function login(page: Page, who = "CUSTOMER", target = "/account") {
  await page.goto("/login?redirect=" + encodeURIComponent(target));
  await page
    .getByLabel("Identifiant", { exact: true })
    .fill(config["DEV_" + who + "_EMAIL"]);
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill(config["DEV_" + who + "_PASSWORD"]);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"),
  );
}
async function seedAttempt(
  request: APIRequestContext,
  simulation = "success",
  fault: string | null = null,
) {
  const key = randomUUID();
  await api(request, "POST", "/api/orders/testing/plans", adminToken, {
    user_id: userId,
    idempotency_key: key,
    simulation,
    fault,
  });
  return {
    key,
    userId,
    body: {
      items: [{ product_id: 1001, quantity: 1 }],
      warehouse_id: warehouse,
    },
  };
}
async function checkoutUI(
  page: Page,
  attempt: Awaited<ReturnType<typeof seedAttempt>>,
) {
  await page.evaluate(
    (a) => sessionStorage.setItem("market-checkout", JSON.stringify(a)),
    attempt,
  );
  await page.getByRole("link", { name: /Panier \(/ }).click();
  await page.goto("/login");
  await login(page, "CUSTOMER", "/checkout");
  await page
    .getByRole("button", { name: "Reprendre la même tentative" })
    .click();
  await expect(page).toHaveURL(/\/account\/orders\/\d+$/);
  return Number(page.url().split("/").at(-1));
}
test.beforeAll(async ({ request }) => {
  adminToken = (
    await api(request, "POST", "/api/auth/login", undefined, {
      username: config.DEV_ADMIN_EMAIL,
      password: config.DEV_ADMIN_PASSWORD,
    })
  ).access_token;
  customerToken = (
    await api(request, "POST", "/api/auth/login", undefined, {
      username: config.DEV_CUSTOMER_EMAIL,
      password: config.DEV_CUSTOMER_PASSWORD,
    })
  ).access_token;
  userId = (await api(request, "GET", "/api/auth/me", customerToken)).user_id;
  warehouse = (
    await api(request, "POST", "/api/inventory/warehouses", adminToken, {
      name: "Phase5 browser verification " + randomUUID(),
      city: "Isolated E2E",
      capacity_units: 10000,
    })
  ).warehouse_id;
  await api(
    request,
    "POST",
    "/api/inventory/adjustments",
    adminToken,
    {
      product_id: 1001,
      warehouse_id: warehouse,
      delta: 100,
      reason: "Phase5 isolated browser verification",
    },
    randomUUID(),
  );
});
test.afterAll(async ({ request }) => {
  if (!warehouse) return;
  const result = await api(
    request,
    "GET",
    "/api/inventory/products/1001/warehouses",
    adminToken,
  );
  const row = result.items.find(
    (w: { warehouse_id: number }) => w.warehouse_id === warehouse,
  );
  expect(row.reserved_quantity).toBe(0);
  if (row.available)
    await api(
      request,
      "POST",
      "/api/inventory/adjustments",
      adminToken,
      {
        product_id: 1001,
        warehouse_id: warehouse,
        delta: -row.available,
        reason: "Phase5 release unused isolated fixture stock",
      },
      randomUUID(),
    );
});
test("live published products, search, detail and persistent cart", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /La performance/ }),
  ).toBeVisible();
  await expect(page.locator(".product-card")).toHaveCount(4);
  await page.goto("/shop");
  await page.getByLabel("Rechercher", { exact: true }).fill("Ryzen");
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  await expect(page.locator(".product-card").first()).toContainText("Ryzen");
  await page.locator(".product-card h3 a").first().click();
  await expect(
    page.getByRole("heading", { name: "Spécifications techniques" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ajouter au panier", exact: true })
    .click();
  await expect(page.locator("p[role=status]")).toContainText("ajouté");
  await page.getByRole("link", { name: /Panier \(/ }).click();
  await expect(
    page.getByRole("heading", { name: "Votre panier", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".cart-line")).toHaveCount(1);
  await page.getByRole("button", { name: "Augmenter la quantité" }).click();
  await expect(page.getByLabel("Quantité", { exact: true })).toHaveText("2");
});
test("GraphQL excludes unpublished product and supports actual pagination", async ({
  request,
  page,
}) => {
  const r = await api(request, "POST", "/graphql", undefined, {
    query:
      '{products(pageSize:100){total items{productId active}}product(productId:"900001"){productId}}',
  });
  expect(r.data.products.total).toBe(42);
  expect(
    r.data.products.items.every((p: { active: boolean }) => p.active),
  ).toBe(true);
  expect(r.data.product).toBeNull();
  await page.goto("/products/900001");
  await expect(
    page.getByRole("heading", { name: "Produit indisponible" }),
  ).toBeVisible();
  await page.goto("/shop");
  await expect(page.locator(".product-card")).toHaveCount(12);
  await page.getByRole("button", { name: "Suivant", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator(".product-card")).toHaveCount(12);
});
test("customer auth, live inventory and forbidden admin area", async ({
  page,
  request,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Boutique", exact: true }).click();
  await page.locator(".product-card h3 a").first().click();
  await expect(page.locator(".stock-badge")).toContainText(
    /disponibles|Indisponible/,
  );
  await page.evaluate(() => window.history.pushState({}, "", "/admin"));
  await page.evaluate(() =>
    window.dispatchEvent(new PopStateEvent("popstate")),
  );
  await expect(
    page.getByRole("heading", { name: "Accès réservé" }),
  ).toBeVisible();
  const response = await request.get(base + "/api/orders?all_customers=true", {
    headers: { Authorization: "Bearer " + customerToken },
  });
  expect(response.status()).toBe(403);
});
test("admin accesses all five groups, real orders, catalog and warehouses", async ({
  page,
}) => {
  await login(page, "ADMIN", "/admin");
  await expect(
    page.getByRole("navigation", { name: "Administration" }).getByRole("link"),
  ).toHaveCount(5);
  await expect(
    page.getByText("Produits actifs", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".metric").nth(1)).toHaveText("42");
  await page.getByRole("link", { name: "Commandes", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Commande", exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.getByRole("link", { name: "Catalogue", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await page.getByRole("link", { name: "Inventaire", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Réservé", exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
});
test("successful browser checkout persists one order and real payment", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const attempt = await seedAttempt(request);
  const oid = await checkoutUI(page, attempt);
  await expect(
    page.getByRole("heading", { name: "Commande confirmée", exact: true }),
  ).toBeVisible();
  const o = await api(request, "GET", "/api/orders/" + oid, customerToken);
  expect(o.status).toBe("PAID");
  expect(o.items[0].warehouse_id).toBe(warehouse);
  const p = await api(
    request,
    "GET",
    "/api/payments/" + o.saga.payment_id,
    customerToken,
  );
  expect(p.status).toBe("SUCCEEDED");
  const same = await api(
    request,
    "POST",
    "/api/orders",
    customerToken,
    attempt.body,
    attempt.key,
  );
  expect(same.order_id).toBe(oid);
});
test("declined browser checkout shows definitive rejection", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const oid = await checkoutUI(page, await seedAttempt(request, "decline"));
  await expect(
    page.getByRole("heading", { name: /Paiement refusé/ }),
  ).toBeVisible();
  const o = await api(request, "GET", "/api/orders/" + oid, customerToken);
  expect(o.status).toBe("PAYMENT_FAILED");
  expect(o.complete).toBe(true);
});
test("pending browser checkout is never falsely shown as failed and later recovers", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const oid = await checkoutUI(
    page,
    await seedAttempt(request, "timeout_succeeded", "pause_after_reserve"),
  );
  try {
    await expect(
      page.getByRole("heading", { name: /Traitement en cours/ }),
    ).toBeVisible();
    expect(await page.getByRole("main").innerText()).not.toContain(
      "Paiement refusé",
    );
  } finally {
    await api(
      request,
      "POST",
      "/api/orders/" + oid + "/testing/resume",
      adminToken,
    );
  }
  await expect(
    page.getByRole("heading", { name: "Commande confirmée", exact: true }),
  ).toBeVisible({ timeout: 45000 });
  const o = await api(request, "GET", "/api/orders/" + oid, customerToken);
  expect(o.status).toBe("PAID");
});
test("session logout clears client state and deep-link refresh preserves router", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Déconnexion", exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await page.goto("/account");
  await expect(page).toHaveURL(/login/);
  await page.goto("/pc-builder");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Génération indisponible" }),
  ).toBeDisabled();
});
test("analytics uses materialized data and future integrations remain explicit", async ({
  page,
}) => {
  await login(page, "ADMIN", "/admin/analytics");
  await expect(
    page.getByRole("heading", { name: "Pipeline et rapprochement" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "AI PC Builder", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Service non disponible" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Observabilité", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Supervision étendue" }),
  ).toBeVisible();
});
for (const width of [375, 768, 1024, 1440])
  test(`responsive storefront and admin screenshots ${width}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.setViewportSize({ width, height: 1000 });
    mkdirSync(resolve("..", ".local", "screenshots"), { recursive: true });
    await page.goto("/");
    await expect(page.locator(".product-card")).toHaveCount(4);
    await page.screenshot({
      path: resolve("..", ".local", "screenshots", `storefront-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await login(page, "ADMIN", "/admin");
    await expect(page.locator(".metric").nth(1)).toHaveText("42");
    await expect(page.locator(".metric").first()).toHaveText(/^\d+$/);
    await expect(page.locator(".service-grid .service")).toHaveCount(4);
    await page.screenshot({
      path: resolve("..", ".local", "screenshots", `admin-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });

test("normal cart revalidation and checkout send only server-authorized identities", async ({
  page,
  request,
}) => {
  await login(page, "CUSTOMER", "/products/1001");
  await page
    .getByRole("button", { name: "Ajouter au panier", exact: true })
    .click();
  await page.getByRole("link", { name: /Panier \(/ }).click();
  await page
    .getByRole("link", { name: "Vérifier et commander", exact: true })
    .click();
  await page
    .getByLabel("Entrepôt de préparation")
    .selectOption(String(warehouse));
  await page.getByRole("button", { name: "Revalider les articles" }).click();
  await expect(
    page.getByRole("heading", { name: "Sélection disponible", exact: true }),
  ).toBeVisible();
  const sent = page.waitForRequest(
    (r) => r.url().endsWith("/api/orders") && r.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Confirmer la commande simulée" })
    .click();
  const req = await sent;
  expect(req.headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
  expect(req.postDataJSON()).toEqual({
    items: [{ product_id: 1001, quantity: 1 }],
    warehouse_id: warehouse,
  });
  await expect(
    page.getByRole("heading", { name: "Commande confirmée", exact: true }),
  ).toBeVisible();
  const id = page.url().split("/").at(-1);
  const actual = await api(request, "GET", "/api/orders/" + id, customerToken);
  expect(actual.status).toBe("PAID");
  expect(actual.total_cents).toBe(actual.items[0].unit_price_cents);
});

test("accessible storefront and admin have no serious or critical axe violations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(4);
  const store = await new AxeBuilder({ page }).analyze();
  expect(
    store.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await login(page, "ADMIN", "/admin");
  await expect(page.locator(".metric").nth(1)).toHaveText("42");
  const admin = await new AxeBuilder({ page }).analyze();
  expect(
    admin.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
});
