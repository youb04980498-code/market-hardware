import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { parse } from "dotenv";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { WorldSnapshot } from "../src/store3d/worldModel";
const env = parse(readFileSync(resolve("..", ".env")));
const shots = resolve("..", ".local", "screenshots", "3d-world");
// Software WebGL renders the entire city during repeated focus/screenshot checks.
test.setTimeout(300000);
test.use({
  viewport: { width: 1600, height: 1100 },
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});
async function enter(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login?redirect=%2Fadmin%2F3d-world%3Fview%3Doverview");
  await page
    .getByLabel("Identifiant", { exact: true })
    .fill(env.DEV_ADMIN_EMAIL);
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill(env.DEV_ADMIN_PASSWORD);
  const pending = page.waitForResponse(
    (r) => r.url().includes("/api/world/snapshot") && r.status() === 200,
  );
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "One connected city." }),
  ).toBeVisible();
  await expect(page.getByText("Campus ready", { exact: true })).toBeVisible();
  return (await pending).json() as Promise<WorldSnapshot>;
}
async function focus(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Focus camera" })
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByText("Campus ready", { exact: true })).toBeVisible();
}
async function shot(page: Page, name: string) {
  mkdirSync(shots, { recursive: true });
  await page.screenshot({
    path: resolve(shots, name + ".png"),
    fullPage: true,
  });
}

test("one continuous campus uses recorded data, keeps all facilities mounted and never writes business data", async ({
  page,
}) => {
  const errors: string[] = [],
    writes: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      r.method() !== "GET" &&
      /\/api\/(orders|inventory|payments)/.test(r.url())
    )
      writes.push(r.url());
  });
  const data = await enter(page);
  const canvas = await page.locator("canvas").elementHandle();
  await expect(page.getByTestId("warehouse-total")).toHaveText(
    String(data.warehouses.data!.items.length),
  );
  await expect(page.getByTestId("order-total")).toHaveText(
    String(data.orders.data!.total),
  );
  await expect(page.getByTestId("world-stream")).toContainText(
    "Kafka + SSE connected",
  );
  await shot(page, "campus-overview");
  for (let round = 0; round < 2; round++) {
    for (const name of [
      "Store",
      "Checkout",
      "Warehouses",
      "Fulfillment",
      "Business",
      "Campus",
    ]) {
      await focus(page, name);
      expect(
        await canvas!.evaluate((el) => el === document.querySelector("canvas")),
      ).toBe(true);
      await page.waitForTimeout(550);
      await expect(
        page.getByRole("heading", {
          name: "Graphics connection interrupted",
          exact: true,
        }),
      ).toHaveCount(0);
    }
  }
  await focus(page, "Business");
  await page
    .getByRole("button", {
      name: "Analytics office Illustrative building · existing service reads",
    })
    .click();
  await expect(
    page.getByRole("link", { name: "Open existing analytics" }),
  ).toBeVisible();
  await shot(page, "city-business");
  await focus(page, "Warehouses");
  await page.getByLabel("Include TEST warehouses").check();
  await expect(
    page.locator(".campus-records").first().getByRole("button"),
  ).toHaveCount(data.warehouses.data!.items.length);
  await page
    .locator(".campus-records")
    .first()
    .getByRole("button")
    .first()
    .click();
  await expect(
    page.locator(".campus-records").first().getByRole("button").first(),
  ).toContainText("available");
  await page
    .locator(".campus-records")
    .first()
    .getByRole("button")
    .first()
    .click();
  await expect(page.locator(".campus-detail dd")).toHaveCount(3);
  await shot(page, "campus-warehouse");
  await focus(page, "Fulfillment");
  // Warehouse selection already opens the inspector; keep it open on camera focus.
  await expect(page.getByLabel("Filter order status")).toBeVisible();
  await page.getByLabel("Filter order status").selectOption("PAID");
  await page
    .locator(".campus-records")
    .first()
    .getByRole("button")
    .first()
    .click();
  await expect(
    page.getByRole("link", { name: "Open existing order administration" }),
  ).toBeVisible();
  await shot(page, "campus-fulfillment");
  await focus(page, "Checkout");
  await shot(page, "campus-checkout");
  await focus(page, "Store");
  await shot(page, "campus-store");
  await page
    .getByRole("button", { name: "Add DEMO activity", exact: true })
    .click();
  await expect(page.locator(".campus-mode")).toContainText("DEMO ACTIVITY");
  await expect(
    page.getByRole("button", { name: "DEMO ACTIVITY ON", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await focus(page, "Campus");
  await page.getByRole("button", { name: "Close record inspector" }).click();
  await shot(page, "campus-demo");
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    axe.violations
      .filter((v) => ["critical", "serious"].includes(v.impact ?? ""))
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("campus reconnects, retrieves exact order IDs and supports desktop windows", async ({
  page,
  context,
}) => {
  const data = await enter(page);
  const id = data.orders.data!.items[0].order_id;
  await expect(page.getByTestId("world-stream")).toContainText(
    "Kafka + SSE connected",
  );
  await context.setOffline(true);
  await expect(page.getByTestId("world-stream")).toContainText("disconnected", {
    timeout: 20000,
  });
  await context.setOffline(false);
  await expect(page.getByTestId("world-stream")).toContainText(
    "Kafka + SSE connected",
    { timeout: 25000 },
  );
  await focus(page, "Fulfillment");
  await page.getByRole("button", { name: "Toggle record inspector" }).click();
  await page.getByLabel("Search world records").fill(String(id));
  await page
    .getByRole("button", { name: `Look up order #${id}`, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: `Order #${id}`, exact: true }),
  ).toBeVisible();
  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
