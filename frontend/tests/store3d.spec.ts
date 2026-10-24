import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { parse } from "dotenv";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const env = parse(readFileSync(resolve("..", ".env")));
const shots = resolve("..", ".local", "screenshots", "3d-store");
test.setTimeout(120000);
test.use({
  viewport: { width: 1600, height: 1000 },
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});
async function enter(page: Page) {
  await page.goto("/login?redirect=%2Fadmin%2F3d-store");
  await page
    .getByLabel("Identifiant", { exact: true })
    .fill(env.DEV_ADMIN_EMAIL);
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill(env.DEV_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /A little store/ }),
  ).toBeVisible();
  await expect(page.getByText("ISOMETRIC VIEW", { exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
}

test("3D demo renders, selects displays/shoppers, pauses, orbits and resets without business writes", async ({
  page,
}) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (r) => {
    if (
      r.method() !== "GET" &&
      /\/api\/(orders|inventory|payments)|\/graphql/.test(r.url())
    )
      writes.push(r.url());
  });
  await enter(page);
  await expect(
    page.getByText("DEMO / SIMULATION", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await expect(
    page.getByText("Simulation paused", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(800);
  mkdirSync(shots, { recursive: true });
  await page.screenshot({
    path: resolve(shots, "store-1600.png"),
    fullPage: true,
  });
  const sceneBox = (await page.locator("canvas").boundingBox())!;
  await page.locator("canvas").click({
    position: { x: sceneBox.width * 0.41, y: sceneBox.height * 0.33 },
  });
  await expect(
    page.getByRole("heading", { name: "Graphics cards", exact: true }),
  ).toBeVisible();
  await page.locator("canvas").click({
    position: { x: sceneBox.width * 0.67, y: sceneBox.height * 0.61 },
  });
  await expect(
    page.getByRole("heading", { name: "Meet Taylor." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Graphics cards", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Graphics cards", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Meet the demo shoppers").selectOption("02");
  await expect(page.getByRole("heading", { name: "Meet Sam." })).toBeVisible();
  await expect(page.locator(".mini-state-tag")).toHaveText("Cart");
  const canvas = page.locator("canvas");
  const box = (await canvas.boundingBox())!;
  const before = await canvas.screenshot();
  await page.waitForTimeout(250);
  expect((await canvas.screenshot()).equals(before)).toBe(true);
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width * 0.6 + 130,
    box.y + box.height * 0.6 + 25,
    { steps: 14 },
  );
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  const orbited = await canvas.screenshot();
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(400);
  expect((await canvas.screenshot()).equals(orbited)).toBe(false);
  const zoomed = await canvas.screenshot();
  await page.mouse.down({ button: "right" });
  await page.mouse.move(
    box.x + box.width * 0.6 + 200,
    box.y + box.height * 0.6 + 55,
    { steps: 10 },
  );
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(400);
  expect((await canvas.screenshot()).equals(zoomed)).toBe(false);
  await page.getByRole("button", { name: "Reset camera", exact: true }).click();
  await page
    .getByRole("button", { name: "Resume simulation", exact: true })
    .click();
  await expect(
    page.getByText("Simulation running", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Camera controls help", exact: true })
    .click();
  await expect(
    page.getByText("Make yourself at home", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close camera help", exact: true })
    .click();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    axe.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
});

test("desktop widths, reduced motion and missing WebGL have explicit states", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enter(page);
  await expect(
    page.getByRole("button", { name: "Resume simulation", exact: true }),
  ).toBeVisible();
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: resolve(shots, `store-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("link", { name: "Back to administration" }).click();
  await expect(
    page.getByRole("navigation", { name: "Administration" }).getByRole("link"),
  ).toHaveCount(6);
  await page.getByRole("link", { name: "3D Store Demo" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("ISOMETRIC VIEW", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas")!;
    canvas.dispatchEvent(new Event("webglcontextlost"));
  });
  await expect(
    page.getByRole("heading", {
      name: "The graphics connection was interrupted",
    }),
  ).toBeVisible();
});

test("the prototype retains the existing admin authentication guard", async ({
  page,
}) => {
  await page.goto("/admin/3d-store");
  await expect(page.getByLabel("Identifiant", { exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
});
