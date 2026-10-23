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
    page.getByRole("heading", { name: "Pipeline et rapprochement" }),
  ).toBeVisible();
  await expect(page.locator(".analytics-metrics .metric")).toHaveCount(12);
  await expect(
    page.locator(".analytics-metrics .metric").first(),
  ).toContainText("€");
  await page.getByLabel("Trimestre", { exact: true }).selectOption("2025-Q1");
  await expect(page.getByLabel("Du", { exact: true })).toHaveValue(
    "2025-01-01",
  );
  await expect(page.getByLabel("Au (exclu)")).toHaveValue("2025-04-01");
  await expect(
    page.getByRole("heading", { name: "Pipeline et rapprochement" }),
  ).toBeVisible();
  await page.getByLabel("Du", { exact: true }).fill("2099-01-01");
  await page.getByLabel("Au (exclu)").fill("2099-02-01");
  await expect(page.locator(".analytics-metrics .metric").first()).toHaveText(
    /0,00/,
  );
  await expect(
    page.getByRole("heading", { name: "Aucun résultat" }).first(),
  ).toBeVisible();
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
  await expect(page.getByRole("status")).toContainText("Chargement");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".analytics-metrics")).toHaveCount(0);
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
  await expect(
    page.getByText("Données périmées ou vérification interrompue"),
  ).toBeVisible();
});
test("customer cannot open analytics", async ({ page }) => {
  await login(page, "CUSTOMER");
  await expect(page.getByText(/Accès refusé|Accès réservé/)).toBeVisible();
  await expect(page.locator(".analytics-metrics")).toHaveCount(0);
});
for (const width of [375, 768, 1024, 1440])
  test("analytics responsive and accessible " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page);
    await expect(
      page.getByRole("heading", { name: "Pipeline et rapprochement" }),
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
