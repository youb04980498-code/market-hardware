import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { parse } from "dotenv";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const env = parse(readFileSync(resolve("..", ".env")));
async function login(page: Page, who = "ADMIN") {
  await page.goto("/login?redirect=%2Fadmin%2Fanalytics");
  await page
    .getByLabel("Identifiant", { exact: true })
    .fill(env["DEV_" + who + "_EMAIL"]);
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill(env["DEV_" + who + "_PASSWORD"]);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
}
test("real analytics values, filters and empty period", async ({ page }) => {
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Fiabilité des données" }),
  ).toBeVisible();
  await expect(page.locator(".kpi-strip .metric")).toHaveCount(4);
  await expect(page.locator(".kpi-strip .metric").first()).toContainText("€");
  await page.getByLabel("Trimestre", { exact: true }).selectOption("2025-Q1");
  await expect(page.locator(".range-control")).toContainText("2025-01-01");
  await expect(page.locator(".range-control")).toContainText("2025-04-01");
  await expect(
    page.getByRole("heading", { name: "Fiabilité des données" }),
  ).toBeVisible();
  await page.locator(".range-control button").first().click();
  await page.getByLabel("Année du calendrier").selectOption("2099");
  await page.getByLabel("Mois du calendrier").selectOption("01");
  await page.getByRole("button", { name: "2099-01-01", exact: true }).click();
  await page.getByRole("button", { name: "2099-01-02", exact: true }).click();
  await page.getByRole("button", { name: "Appliquer la période" }).click();
  await expect(page.locator(".kpi-strip .metric").first()).toHaveText(/0,00/);
  await expect(
    page.getByText("Aucun résultat", { exact: true }).first(),
  ).toBeVisible();
  await page.getByLabel("Trimestre", { exact: true }).selectOption("2025-Q1");
  await page
    .getByRole("group", { name: "Navigation Analytics" })
    .getByRole("button", { name: "Produits", exact: true })
    .click();
  await page.getByLabel("Catégorie", { exact: true }).selectOption("GPU");
  await expect(page.getByLabel("Catégorie", { exact: true })).toHaveValue(
    "GPU",
  );
});
test("analytics loading and API errors never manufacture values", async ({
  page,
}) => {
  await page.route("**/api/analytics/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "ANALYTICS_NOT_READY",
          message: "Analytics unavailable",
        },
      }),
    });
  });
  await login(page);
  await expect(
    page.getByRole("status", { name: "Chargement des données" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".kpi-strip .metric")).toHaveText([
    "—",
    "—",
    "—",
    "—",
  ]);
});
test("stale metadata is prominently visible", async ({ page }) => {
  await page.route("**/api/analytics/**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.metadata.stale = true;
    body.metadata.pipeline_state = "ERROR";
    await route.fulfill({ response, json: body });
  });
  await login(page);
  await expect(page.getByText(/Projection ancienne/).first()).toBeVisible();
});
test("customer cannot open analytics", async ({ page }) => {
  await login(page, "CUSTOMER");
  await expect(page.getByText(/Accès refusé|Accès réservé/)).toBeVisible();
  await expect(page.locator(".kpi-strip")).toHaveCount(0);
});
for (const width of [1280, 1440, 1920, 3440])
  test("analytics responsive and accessible " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page);
    await expect(
      page.getByRole("heading", { name: "Fiabilité des données" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
    mkdirSync(resolve("..", ".local", "screenshots"), { recursive: true });
    await page.screenshot({
      path: resolve(
        "..",
        ".local",
        "screenshots",
        "analytics-" + width + ".png",
      ),
      fullPage: true,
    });
  });
