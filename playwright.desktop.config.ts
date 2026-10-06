import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/desktop-e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"]] : "list",
  use: {
    trace: "retain-on-failure",
  },
});
