import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/server-tools",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:8792",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run server-build && npm run server-start",
    url: "http://127.0.0.1:8792/api/tpdf/health",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      TPDF_HOST: "127.0.0.1",
      TPDF_PORT: "8792",
      TPDF_DATA_DIR: ".tpdf-server-tools-data",
      TPDF_CERTIFICATE_MASTER_KEY: "tpdf-server-tools-ci-master-key-2026",
      TPDF_PYTHON_PATH: process.platform === "win32" ? "python" : "python3",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
