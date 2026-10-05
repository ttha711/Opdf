import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { closeEmbedPdfSidebar, openEmbedPdfSidebar } from "../helpers/embedpdf";

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
  await expect(page.getByText("Opdf Power Tools Dashboard")).toHaveCount(0);

  const mobileMenu = page.locator("header").getByRole("button", { name: "☰", exact: true });
  await expect(mobileMenu).toBeVisible();
  await expect(page.locator("header").getByRole("button", { name: "File", exact: true })).toBeHidden();

  const primary = page.getByRole("button", { name: "Open PDF", exact: true });
  const primaryBox = await primary.boundingBox();
  expect(primaryBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const pdf = await createMobilePdf();
  const input = page.locator('input[type="file"][accept="application/pdf"]').first();
  await input.setInputFiles({
    name: "mobile-three-pages.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });

  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("page-status")).toContainText(/Page\s+1\s+of\s+3/i, { timeout: 30_000 });

  const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(documentOverflow).toBeLessThanOrEqual(1);

  const viewer = page.locator(".viewer-shell");
  const sidebar = await openEmbedPdfSidebar(viewer);
  const sidebarBox = await sidebar.boundingBox();
  const viewport = page.viewportSize();
  expect(sidebarBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((sidebarBox?.x ?? 0) + (sidebarBox?.width ?? Infinity)).toBeLessThanOrEqual(viewport?.width ?? 412);

  // EmbedPDF renders its toolbar in Shadow DOM and owns its 32px chrome.
  // OPDF verifies operability and drawer geometry here; OPDF-owned mobile
  // actions retain the 44px touch-target assertion above.
  await closeEmbedPdfSidebar(viewer);

  await mobileMenu.click();
  await expect(page.locator("header").getByRole("menuitem", { name: "Fit Page", exact: true })).toBeEnabled();
  await page.locator("header").getByRole("menuitem", { name: "Fit Page", exact: true }).click();
  await expect(page.locator("header").getByRole("menu")).toHaveCount(0);
});
