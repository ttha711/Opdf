import { test, expect } from "@playwright/test";

test("mobile tab overview has no redundant search and supports open", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  const opener = page.locator('[data-tpdf-action="open-tab-switcher"]');
  await expect(opener).toBeVisible();
  await opener.click();
  const overview = page.locator('[data-tpdf-tab-switcher="open"]');
  await expect(overview).toBeVisible();
  await expect(overview.getByPlaceholder(/search your tabs/i)).toHaveCount(0);
  await expect(overview.locator('[data-tpdf-action="mobile-new-tab"]')).toBeVisible();
  await expect(overview.locator('.mobile-tab-fab')).toHaveCSS("position", "static");
});

test("workspace home prioritizes Open PDF and compact quick actions", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  const home = page.locator(".tpdf-home--focused");
  await expect(home).toBeVisible();
  await expect(home.getByRole("button", { name: /open pdf/i })).toBeVisible();
  await expect(home.getByRole("heading", { name: "Recent documents" })).toBeVisible();
  await expect(home.locator(".tpdf-home__action-list button")).toHaveCount(5);
});
