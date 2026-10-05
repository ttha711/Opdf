import { expect, type Locator } from "@playwright/test";

/**
 * Stable selectors for the EmbedPDF 2.15.x viewer surface used by OPDF.
 *
 * Prefer the viewer's explicit data hooks over generated Tailwind classes,
 * translated labels, thumbnail DOM shape, or ARIA state that the package
 * does not expose.
 */
export const EMBEDPDF_SIDEBAR_PANEL = '[data-sidebar-id="sidebar-panel"]';
export const EMBEDPDF_PAGE_CONTROLS = '[data-epdf-i="page-controls"]';

export function embedPdfSidebarButton(viewer: Locator) {
  return viewer.getByRole("button", { name: "Sidebar", exact: true }).first();
}

export function embedPdfSidebarPanel(viewer: Locator) {
  return viewer.locator(EMBEDPDF_SIDEBAR_PANEL).first();
}

export async function openEmbedPdfSidebar(viewer: Locator) {
  const button = embedPdfSidebarButton(viewer);
  const panel = embedPdfSidebarPanel(viewer);
  await expect(button).toBeVisible();
  await button.click();
  await expect(panel).toBeVisible({ timeout: 15_000 });
  return panel;
}

export async function closeEmbedPdfSidebar(viewer: Locator) {
  const button = embedPdfSidebarButton(viewer);
  const panel = embedPdfSidebarPanel(viewer);
  const mobileOverlay = panel.locator("xpath=preceding-sibling::div[1]");

  if (await mobileOverlay.isVisible()) {
    await mobileOverlay.click();
  } else {
    await button.click();
  }
  await expect(panel).toBeHidden({ timeout: 15_000 });
}

export async function goToEmbedPdfPage(viewer: Locator, pageNumber: number) {
  const input = viewer.locator(`${EMBEDPDF_PAGE_CONTROLS} input[inputmode="numeric"]`).first();
  await expect(input).toBeAttached();
  await input.fill(String(pageNumber));
  await input.press("Enter");
}
