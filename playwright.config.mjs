import { defineConfig } from "@playwright/test";

const port = Number(process.env.AMPLY_TEST_PORT || 3310);

export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.mjs",
  outputDir: "./.next/amply-playwright-results",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/test-server.mjs",
    url: `http://localhost:${port}`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});