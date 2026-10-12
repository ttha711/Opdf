import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

test("organize pages uses existing page operations and changes the PDF only after Apply", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const sheet = pdf.addPage([612, 792]);
    sheet.drawText(`ORGANIZER SHEET ${i}`, { x: 72, y: 700, size: 22, font });
  }
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name: "organize-fixture.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator('[data-tpdf-engine="pdfium-wasm"]')).toBeVisible({timeout:20000});
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", {name: "Find a command"}).fill("organize");
  await page.locator('[data-tpdf-command="organize"]').click();
  await page.locator('[data-tpdf-action="open-page-organizer"]').click();
  const grid = page.locator('[data-tpdf-dialog="organize-pages"]');
  await expect(grid).toBeVisible();
  await expect(grid.locator('[data-tpdf-organizer-page]')).toHaveCount(3);
  await grid.locator('[data-tpdf-organizer-page="2"]').click();
  await grid.locator('[data-tpdf-action="organizer-rotate-right"]').click();
  await expect(grid.locator('[data-tpdf-action="organizer-apply"]')).toBeDisabled();
  await grid.getByRole("checkbox").check();
  await grid.locator('[data-tpdf-action="organizer-apply"]').click();
  await expect(grid).toHaveCount(0);
  await expect(page.locator('[data-tpdf-engine="pdfium-wasm"]')).toBeVisible({timeout:20000});
  await expect(page.locator('[data-tpdf-action="open-page-organizer"]')).toBeVisible();
});
