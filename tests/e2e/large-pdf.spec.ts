import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
  await page.goto("/");
  const pdf = await createDrawingSet();

  const input = page.locator('input[type="file"][accept="application/pdf"]').first();
  await input.setInputFiles({
    name: "structural-120-sheets.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });

  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Page\s+1\s+of\s+120/i)).toBeVisible({ timeout: 30_000 });

  // OPDF's page-management rail must remain available on the PDFium path.
  await expect(page.getByText("Ctrl+click or Shift+click to select pages")).toBeVisible();
  await expect(page.getByText("Page 1", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  // Measurement is implemented with native PDFium vector annotations, not the
  // removed PDF.js/Fabric page renderer.
  await page.getByRole("button", { name: /Measure Tool/i }).click();
  await expect(page.getByText("Measure", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Measurement mode")).toHaveValue("distance");

  // The visible header input is the page-number field; exclude the hidden file input.
  const navigationField = page.locator('header input:not([type="file"])').first();
  await navigationField.fill("100");
  await navigationField.press("Enter");
  await expect(page.getByText(/Page\s+100\s+of\s+120/i)).toBeVisible({ timeout: 15_000 });
});
