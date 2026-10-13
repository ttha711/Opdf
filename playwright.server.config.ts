import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/server-e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:8787",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run server-build && npm run server-start",
    url: "http://127.0.0.1:8787/api/tpdf/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      TPDF_HOST: "127.0.0.1",
      TPDF_PORT: "8787",
      TPDF_DATA_DIR: ".tpdf-e2e-data",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
