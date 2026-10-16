import { expect, type Page } from "@playwright/test";

export async function zoomInFromViewer(page: Page) {
  const status = page.locator('[data-tpdf-region="status-bar"]');
  const before = Number(await status.getAttribute("data-tpdf-zoom"));
  if ((page.viewportSize()?.width ?? 0) < 600) {
    await page.getByRole("button", { name: "Zoom Menu" }).click();
    const menuZoomIn = page.locator("button").filter({ hasText: /^Zoom In$/ });
    await expect(menuZoomIn).toBeVisible();
    await menuZoomIn.click();
  } else {
    await page.getByRole("button", { name: "Zoom In" }).first().click();
  }

  await expect.poll(async () => Number(await status.getAttribute("data-tpdf-zoom")))
    .toBeGreaterThan(before);
}
