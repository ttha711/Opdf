import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { closeEmbedPdfSidebar, openEmbedPdfSidebar } from "../helpers/embedpdf";
import { clickApplicationMenuPath, getApplicationMenuPathItem } from "../helpers/app-menu";

async function createMobilePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`MOBILE PAGE ${pageNumber}`, { x: 72, y: 760, size: 24, font });
  }
  return Buffer.from(await pdf.save());
}

test("mobile Home, menu and Pages drawer remain usable by touch", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Your documents, ready when you are." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open PDF", exact: true })).toBeVisible();
  await expect(page.getByText("Tpdf Power Tools Dashboard")).toHaveCount(0);

  const mobileMenu = page.locator("header").getByRole("button", { name: "Application menu", exact: true });
  await expect(mobileMenu).toBeVisible();
  await expect(page.locator("header").getByRole("button", { name: "File", exact: true })).toHaveCount(0);

  const primary = page.getByRole("button", { name: "Open PDF", exact: true });
  const primaryBox = await primary.boundingBox();
  expect(primaryBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  await mobileMenu.click();
  const mobileSheet = page.locator('[data-tpdf-mobile-sheet="true"]');
  await expect(mobileSheet).toBeVisible();
  await expect(mobileSheet).not.toContainText("Ctrl+O");
  await expect(mobileSheet).not.toContainText("Ctrl+S");
  await expect(mobileSheet).not.toContainText("Ctrl+Z");
  const firstTouchItem = mobileSheet.getByRole("menuitem").first();
  const firstTouchBox = await firstTouchItem.boundingBox();
  expect(firstTouchBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await mobileMenu.click();
  await expect(mobileSheet).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const pdf = await createMobilePdf();
  const input = page.locator('input[type="file"][accept="application/pdf"]').first();
  await input.setInputFiles({
    name: "mobile-three-pages.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });

  await expect(page.locator('[data-tpdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("page-status")).toContainText(/Page\s+1\s+of\s+3/i, { timeout: 30_000 });

  const mobileSave = page.locator('[data-tpdf-action="mobile-save"]');
  await expect(mobileSave).toBeVisible();
  const saveBox = await mobileSave.boundingBox();
  expect(saveBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  const mobileTools = page.locator('[data-tpdf-mobile-edit-toolbar="true"]');
  await expect(mobileTools).toBeVisible();
  const highlight = mobileTools.getByRole("button", { name: "Highlight" });
  const highlightBox = await highlight.boundingBox();
  expect(highlightBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await highlight.click();
  await expect(highlight).toHaveAttribute("aria-pressed", "true");
  const move = mobileTools.getByRole("button", { name: "Move and select PDF" });
  await move.click();
  await expect(move).toHaveAttribute("aria-pressed", "true");

  const pagePreviewButton = page.locator('[data-tpdf-action="toggle-page-filmstrip"]');
  await expect(pagePreviewButton).toBeVisible();
  const pagePreviewButtonBox = await pagePreviewButton.boundingBox();
  expect(pagePreviewButtonBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await pagePreviewButton.click();
  const filmstrip = page.locator('[data-tpdf-mobile-filmstrip="true"]');
  await expect(filmstrip).toBeVisible();
  await expect(filmstrip.getByRole("button", { name: "Go to page 1" })).toBeVisible();
  await expect(filmstrip.getByRole("button", { name: "Go to page 2" })).toBeVisible();
  await expect(filmstrip.getByRole("button", { name: "Go to page 3" })).toBeVisible();
  await filmstrip.getByRole("button", { name: "Go to page 2" }).click();
  await expect(filmstrip).toHaveCount(0);
  await expect(page.getByTestId("page-status")).toContainText(/Page\s+2\s+of\s+3/i, { timeout: 10_000 });
  await pagePreviewButton.click();
  await filmstrip.getByRole("spinbutton", { name: "Jump to page" }).fill("3");
  await filmstrip.getByRole("button", { name: "Go to page", exact: true }).click();
  await expect(page.getByTestId("page-status")).toContainText(/Page\s+3\s+of\s+3/i, { timeout: 10_000 });

  await expect(page.locator(".tpdf-topbar .tab-bar-container")).toBeVisible();
  await page.locator('[data-tpdf-action="home"]').click();
  await expect(page.getByRole("heading", { name: "Your documents, ready when you are." })).toBeVisible();
  const preservedTab = page.locator(".tpdf-header-tabs").getByText("mobile-three-pages.pdf", { exact: true });
  await expect(preservedTab).toBeVisible();
  await preservedTab.click();
  await expect(page.locator('[data-tpdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 20_000 });
  await page.setViewportSize({ width: 320, height: 700 });
  const headerSaveRect = await mobileSave.boundingBox();
  expect((headerSaveRect?.x ?? -1) + (headerSaveRect?.width ?? 1)).toBeLessThanOrEqual(320);
  await expect(mobileSave).toBeVisible();

  const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(documentOverflow).toBeLessThanOrEqual(1);

  const aiFab = page.locator('[data-tpdf-action="open-ai"]');
  await expect(aiFab).toBeVisible();
  await page.setViewportSize({ width: 412, height: 915 });
  const aiFabBox = await aiFab.boundingBox();
  const mobileViewport = page.viewportSize();
  expect(aiFabBox).not.toBeNull();
  expect(mobileViewport).not.toBeNull();
  expect((mobileViewport?.height ?? 0) - ((aiFabBox?.y ?? 0) + (aiFabBox?.height ?? 0))).toBeGreaterThanOrEqual(80);

  await aiFab.tap();
  await expect(page.locator('[data-tpdf-right-sidebar="open"]')).toBeVisible();
  await expect(page.locator('[data-tpdf-action="collapse-right-panel"]')).toBeVisible();
  const drawerBackdrop = page.locator('[data-tpdf-action="right-panel-backdrop"]');
  await expect(drawerBackdrop).toBeVisible();
  await drawerBackdrop.click({ position: { x: 12, y: 120 } });
  await expect(page.locator('[data-tpdf-right-sidebar="closed"]')).toHaveCount(1);
  await expect(page.locator('[data-tpdf-action="expand-right-panel"]')).toBeVisible();

  const viewer = page.locator(".viewer-shell");
  const sidebar = await openEmbedPdfSidebar(viewer);
  const sidebarBox = await sidebar.boundingBox();
  const viewport = page.viewportSize();
  expect(sidebarBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((sidebarBox?.x ?? 0) + (sidebarBox?.width ?? Infinity)).toBeLessThanOrEqual(viewport?.width ?? 412);

  // EmbedPDF renders its toolbar in Shadow DOM and owns its 32px chrome.
  // TPDF verifies operability and drawer geometry here; TPDF-owned mobile
  // actions retain the 44px touch-target assertion above.
  await closeEmbedPdfSidebar(viewer);

  const fitPageItem = await getApplicationMenuPathItem(page, ["View", "Zoom", "Fit Page"]);
  await expect(fitPageItem).toBeEnabled();
  await clickApplicationMenuPath(page, ["View", "Zoom", "Fit Page"]);
  await expect(page.locator("header").getByRole("menu")).toHaveCount(0);
});
