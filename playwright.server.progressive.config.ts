import { defineConfig, devices } from "@playwright/test";

// Dedicated real-worker gate. Deliberately never reuse an existing server:
// accidentally hitting the old/default process could make a test lie.
export default defineConfig({
  testDir: "./tests/server-e2e",
  testMatch: "progressive-large-pdf.spec.ts",
  timeout: 300_000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8791",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run server-build && npm run server-start",
    url: "http://127.0.0.1:8791/api/tpdf/health",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      TPDF_HOST: "127.0.0.1",
      TPDF_PORT: "8791",
      TPDF_DATA_DIR: ".tpdf-progressive-e2e-data",
      TPDF_REMOTE_RENDER_ENABLED: "1",
      TPDF_PYTHON_PATH: process.env.TPDF_PYTHON_PATH || (process.platform === "win32" ? "python" : "python3"),
      TPDF_RENDER_WORKERS: "1",
      TPDF_RENDER_CACHE_MB: "64",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
