import { defineConfig, devices } from "@playwright/test";

const target = process.env.TPDF_VISUAL_TARGET;
export default defineConfig({
  testDir: "./tests/visual",
  timeout: 150_000,
  expect: { timeout: 12_000 },
  retries: 0,
  workers: 1,
  outputDir: "test-results/visual-audit",
  reporter: [["list"], ["html", { outputFolder: "playwright-report/visual", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: target || "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    screenshot: "off",
  },
  webServer: target ? undefined : {
    command: "npm run dev -w @tpdf/web -- --host 127.0.0.1",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 150_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
