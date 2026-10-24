import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { parse } from "dotenv";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const env = parse(readFileSync(resolve("..", ".env")));
const shots = resolve("..", ".local", "screenshots", "admin-overhaul");
test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(90000);
async function login(page: Page, path: string) {
  await page.goto("/login?redirect=" + encodeURIComponent(path));
  await page
    .getByLabel("Identifiant", { exact: true })
    .fill(env.DEV_ADMIN_EMAIL);
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill(env.DEV_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.locator(".command-header h1")).toBeVisible();
}
function watch(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}
async function settled(page: Page) {
  await expect(
    page.getByRole("button", { name: "Actualiser", exact: true }),
  ).toBeEnabled({ timeout: 45000 });
  await expect(page.locator(".loading-skeleton")).toHaveCount(0, {
    timeout: 45000,
  });
}
async function capture(page: Page, name: string) {
  mkdirSync(shots, { recursive: true });
  await page.screenshot({
    path: resolve(shots, name + "-1440.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    axe.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact || ""),
    ),
  ).toEqual([]);
}
const money = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    n / 100,
  );

test("overview: real executive values, range navigation and wide desktop layout", async ({
  page,
}) => {
  const errors = watch(page);
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/analytics/overview") && r.status() === 200,
  );
  await login(page, "/admin");
  const actual = await (await response).json();
  await settled(page);
  await expect(
    page
      .locator(".kpi-card")
      .filter({ hasText: "Chiffre d’affaires net" })
      .locator(".metric"),
  ).toHaveText(money(actual.data.net_cents));
  await expect(
    page
      .locator(".kpi-card")
      .filter({ hasText: "Commandes" })
      .locator(".metric"),
  ).toHaveText(actual.data.order_count.toLocaleString("fr-FR"));
  await expect(
    page.getByRole("navigation", { name: "Administration" }).getByRole("link"),
  ).toHaveCount(6);
  await expect(page.locator(".service-health")).toHaveCount(6);
  await capture(page, "overview");
  for (const width of [1280, 1920, 3440]) {
    await page.setViewportSize({ width, height: 1080 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width !== 1280)
      await page.screenshot({
        path: resolve(shots, "overview-" + width + ".png"),
        fullPage: true,
      });
    if (width === 3440)
      expect(
        await page
          .locator(".command-header")
          .evaluate((el) => el.getBoundingClientRect().width),
      ).toBeGreaterThan(2800);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".range-control button").first().click();
  await page
    .getByRole("button", { name: "7 derniers jours", exact: true })
    .click();
  await settled(page);
  await expect(page.locator(".range-control")).not.toContainText(
    "Toutes les dates",
  );
  await page
    .getByRole("navigation", { name: "Administration" })
    .getByRole("link", { name: "Catalogue", exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText("Catalogue produits");
  expect(errors).toEqual([]);
});

test("catalog: combined real product filters, pagination and governed detail drawer", async ({
  page,
}) => {
  const errors = watch(page);
  const pimResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/catalog/operations") && r.status() === 200,
  );
  await login(page, "/admin/catalog");
  const pim = await (await pimResponse).json();
  await settled(page);
  await expect(
    page
      .locator(".kpi-card")
      .filter({ hasText: "Total produits PIM" })
      .locator(".metric"),
  ).toHaveText(String(pim.author_total));
  await expect(
    page
      .locator(".kpi-card")
      .filter({ hasText: "En attente de synchronisation" })
      .locator(".metric"),
  ).toHaveText(String(pim.pending_jobs));
  await expect(
    page
      .locator(".kpi-card")
      .filter({ hasText: "Erreurs de publication" })
      .locator(".metric"),
  ).toHaveText(String(pim.publication_errors));
  await expect(
    page.getByText("UnoPim connecté", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".kpi-card")
      .filter({ hasText: "Produits publiés" })
      .locator(".metric"),
  ).toHaveText("42");
  await capture(page, "catalog");
  await page.getByRole("button", { name: "Suivant", exact: true }).click();
  await expect(page.locator(".command-pagination")).toContainText("Page 2");
  await page.getByPlaceholder("Nom du produit ou SKU").fill("MH-CPU-1001");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Ryzen");
  await page
    .getByLabel("Publication", { exact: true })
    .selectOption("published");
  await page
    .locator("tbody")
    .getByRole("button", { name: /Détail / })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "Spécifications techniques",
  );
  await expect(page.getByRole("dialog")).toContainText("UnoPim");
  await page.screenshot({
    path: resolve(shots, "catalog-drawer-1440.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("inventory: current capacity, snapshot risks and warehouse investigation", async ({
  page,
}) => {
  const errors = watch(page);
  await login(page, "/admin/inventory");
  await settled(page);
  await expect(page.locator(".warehouse-card").first()).toBeVisible();
  await capture(page, "inventory");
  await page
    .locator(".warehouse-card")
    .first()
    .getByRole("button", { name: "Examiner", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Capacité physique");
  await expect(page.getByRole("dialog")).toContainText("Mouvements de stock");
  await page.keyboard.press("Escape");
  await page
    .getByRole("group", { name: "Vues" })
    .getByRole("button", { name: "Stocks", exact: true })
    .click();
  await page.getByPlaceholder("Nom, SKU ou identifiant").fill("1001");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.locator("tbody")).toContainText("MH-CPU-1001");
  expect(errors).toEqual([]);
});

test("orders: filters, selected detail and persisted lifecycle without fabricated shipping", async ({
  page,
}) => {
  const errors = watch(page);
  await login(page, "/admin/orders");
  await settled(page);
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: /Examiner commande/ })
    .click();
  await expect(page.getByRole("heading", { name: /Commande #/ })).toBeVisible();
  await expect(page.locator(".lifecycle")).toHaveCount(1);
  await expect(page.locator(".lifecycle")).toContainText("Commande créée");
  await capture(page, "orders");
  await page
    .getByRole("group", { name: "Statuts de commande" })
    .getByRole("button", { name: "Remboursées", exact: true })
    .click();
  await expect(page.locator(".command-table tbody tr").first()).toContainText(
    "Remboursée",
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: /Commande #/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("analytics: financial values, investigation tabs, export and reconciliation", async ({
  page,
}) => {
  const errors = watch(page);
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/analytics/overview") && r.status() === 200,
  );
  await login(page, "/admin/analytics");
  const actual = await (await response).json();
  await settled(page);
  await expect(
    page
      .locator(".kpi-card")
      .filter({ hasText: "Chiffre d’affaires net" })
      .locator(".metric"),
  ).toHaveText(money(actual.data.net_cents));
  await capture(page, "analytics");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/^market-revenue-/);
  await page
    .getByRole("group", { name: "Navigation Analytics" })
    .getByRole("button", { name: "Produits", exact: true })
    .click();
  await page.getByLabel("Catégorie", { exact: true }).selectOption("GPU");
  await expect(page.locator("tbody tr").first()).toContainText(
    "Cartes graphiques",
  );
  await page
    .getByRole("group", { name: "Navigation Analytics" })
    .getByRole("button", { name: "Rapports", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Rapports trimestriels" }),
  ).toBeVisible();
  await page
    .getByText("Déplier le pipeline et les contrôles de rapprochement", {
      exact: true,
    })
    .click();
  await expect(page.getByText("Écart", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("observability: real measurements, safe server proxies and service investigation", async ({
  page,
  request,
}) => {
  const errors = watch(page);
  await login(page, "/admin/observability");
  await settled(page);
  await expect(page.locator(".topology-node")).toHaveCount(14);
  await capture(page, "observability");
  await page.getByRole("button", { name: /Orders API Checkout/ }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Dépendances configurées",
  );
  await expect(page.getByRole("dialog")).toContainText("P95 HTTP");
  await page.keyboard.press("Escape");
  await page
    .getByLabel("Service observé", { exact: true })
    .selectOption("inventory");
  await expect(
    page.getByRole("heading", { name: "Latence des API" }),
  ).toBeVisible();
  const base = process.env.FRONTEND_URL || "http://127.0.0.1:8080";
  for (const path of [
    "/api/analytics/observability/history",
    "/api/analytics/observability/traces",
  ])
    expect((await request.get(base + path)).status()).toBe(401);
  const customer = await request.post(base + "/api/auth/login", {
    data: {
      username: env.DEV_CUSTOMER_EMAIL,
      password: env.DEV_CUSTOMER_PASSWORD,
    },
  });
  expect(customer.status()).toBe(200);
  const token = (await customer.json()).access_token;
  for (const path of [
    "/api/analytics/observability/history",
    "/api/analytics/observability/traces",
  ])
    expect(
      (
        await request.get(base + path, {
          headers: { Authorization: "Bearer " + token },
        })
      ).status(),
    ).toBe(403);
  expect(errors).toEqual([]);
});
