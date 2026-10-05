import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { goToEmbedPdfPage, openEmbedPdfSidebar } from "../helpers/embedpdf";

async function createDrawingSet(pageCount = 120) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const pdfPage = doc.addPage([1684, 1191]);
    pdfPage.drawText(`STRUCTURAL SHEET S-${String(pageNumber).padStart(3, "0")}`, {
      x: 40,
      y: 1135,
      size: 20,
      font,
    });
    for (let x = 60; x < 1620; x += 120) {
      pdfPage.drawLine({
        start: { x, y: 70 },
        end: { x, y: 1100 },
        thickness: 0.5,
        color: rgb(0.35, 0.35, 0.35),
      });
    }
    for (let i = 0; i < 30; i += 1) {
      pdfPage.drawText(`GRID-${i + 1} / BEAM 300x600 / PAGE ${pageNumber}`, {
        x: 80 + (i % 5) * 300,
        y: 1020 - Math.floor(i / 5) * 150,
        size: 9,
        font,
      });
    }
  }
  return Buffer.from(await doc.save());
}

test("opens and navigates a many-sheet technical PDF", async ({ page }) => {
  // Large generated drawings plus PDFium WASM can exceed the global
  // Playwright test budget on shared runners. Assertions remain tighter.
  test.setTimeout(90_000);

  await page.goto("/");
  const pdf = await createDrawingSet();

  const input = page.locator('input[type="file"][accept="application/pdf"]').first();
  await input.setInputFiles({
    name: "structural-120-sheets.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });

  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("page-status")).toContainText(/Page\s+1\s+of\s+120/i, { timeout: 30_000 });

  // The built-in PDFium toolbar is the single familiar annotation surface.
  const viewer = page.locator(".viewer-shell");
  await expect(viewer.getByRole("button", { name: "View", exact: true })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Annotate", exact: true })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Shapes", exact: true })).toBeVisible();
  await expect(page.locator(".viewer-quick-tools")).toHaveCount(0);

  // The engine-owned sidebar is the single page-navigation sidebar.
  await openEmbedPdfSidebar(viewer);

  // Measurement remains an OPDF-specific tool, launched from the conventional
  // Tools menu instead of a second annotation toolbar.
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("menuitem", { name: "Measure Drawing", exact: true }).click();
  await expect(page.getByText("Measure", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Measurement mode")).toHaveValue("distance");
  await page.getByRole("button", { name: "Close measurement tool", exact: true }).click();
  await expect(page.getByLabel("Measurement mode")).toHaveCount(0);

  // Jump through EmbedPDF's own page-control input instead of racing repeated
  // keyboard events against React state updates.
  await goToEmbedPdfPage(viewer, 100);
  await expect(page.getByTestId("page-status")).toContainText(/Page\s+100\s+of\s+120/i, { timeout: 15_000 });
});
