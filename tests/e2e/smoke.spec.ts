import { expect, test } from "@playwright/test";

test("web viewer boots and exposes the primary PDF workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Opdf", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /open/i }).first()).toBeVisible();
  await expect(page.getByTestId("empty-document-status")).toBeVisible();
});
