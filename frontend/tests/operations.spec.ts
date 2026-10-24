import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { parse } from "dotenv";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const env = parse(readFileSync(resolve("..", ".env")));
async function admin(page: Page, path: string) {
  await page.goto("/login?redirect=" + encodeURIComponent(path));
  await page
    .getByLabel("Identifiant", { exact: true })
    .fill(env.DEV_ADMIN_EMAIL);
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill(env.DEV_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
}
for (const width of [375, 1440]) {
  test(`operations pages responsive accessible ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await admin(page, "/admin/observability");
    await expect(
      page.getByRole("heading", { name: "Outils de supervision" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Alertes métier" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ouvrir grafana" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    mkdirSync(resolve("..", ".local", "screenshots"), { recursive: true });
    await page.screenshot({
      path: resolve(
        "..",
        ".local",
        "screenshots",
        `operations-observability-${width}.png`,
      ),
    });
    await page.goto("/admin/inventory");
    await expect(
      page.getByRole("heading", { name: "Capacité des entrepôts" }),
    ).toBeVisible();
    await page.getByLabel("Inclure les entrepôts de test et archivés").check();
    await expect(
      page.locator(".ops-card").filter({ hasText: "TEST" }).first(),
    ).toBeVisible();
    await expect(page.locator("tbody")).not.toContainText(
      "Phase5 browser verification",
    );
    await page.getByLabel("Inclure les stocks de test et archivés").check();
    await expect(page.locator("tbody")).toContainText(
      "Phase5 browser verification",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Commandes du jour" }),
    ).toBeVisible();
  });
}
test("alert acknowledgement and history use persistent API", async ({
  page,
}) => {
  await admin(page, "/admin/observability");
  await expect(
    page.getByRole("heading", { name: "Outils de supervision" }),
  ).toBeVisible();
  const incident = page
    .locator(".ops-card")
    .filter({
      has: page.getByRole("heading", {
        name: "Échec de paiement",
        exact: true,
      }),
    })
    .filter({
      has: page.getByRole("button", { name: "Acquitter", exact: true }),
    })
    .first();
  const reference = await incident
    .locator("p")
    .filter({ hasText: "Référence :" })
    .innerText();
  await incident
    .getByRole("button", { name: "Acquitter", exact: true })
    .click();
  await page.getByLabel("État", { exact: true }).selectOption("ACKNOWLEDGED");
  const retained = page
    .locator(".ops-card")
    .filter({ has: page.getByText(reference, { exact: true }) });
  await expect(retained).toContainText("Acquittée");
  await retained.getByRole("button", { name: "Résoudre", exact: true }).click();
  await page.getByLabel("État", { exact: true }).selectOption("RESOLVED");
  await expect(retained).toContainText("Résolue");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Outils de supervision" }),
  ).toBeVisible();
  await page.getByLabel("État", { exact: true }).selectOption("RESOLVED");
  await expect(retained).toContainText("Résolue");
});
