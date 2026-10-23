import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [
    ["list"],
    [
      "junit",
      {
        outputFile:
          process.env.FRONTEND_JUNIT_FILE ?? "../.local/frontend-e2e.xml",
      },
    ],
  ],
  use: {
    baseURL: process.env.FRONTEND_URL ?? "http://127.0.0.1:8080",
    trace: "off",
    screenshot: "off",
    video: "off",
    viewport: { width: 1440, height: 1000 },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
