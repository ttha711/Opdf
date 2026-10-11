import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

test("organize pages uses existing page operations and changes the PDF only after Apply", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  pdf.addPage([400, 500]);
  pdf.addPage([500, 600]);
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name: "organize-fixture.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({timeout:20000});
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute("data-opdf-total-pages", "3", {timeout:20000});
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", {name: "Find a command"}).fill("organize");
  await page.locator('[data-opdf-command="organize"]').click();
  await page.locator('[data-opdf-action="open-page-organizer"]').click();
  const grid = page.locator('[data-opdf-dialog="organize-pages"]');
  await expect(grid).toBeVisible();
  await expect(grid.locator('[data-opdf-organizer-page]')).toHaveCount(3);
  await grid.locator('[data-opdf-organizer-page="2"]').click();
  await grid.locator('[data-opdf-action="organizer-rotate-right"]').click();
  await expect(grid.locator('[data-opdf-action="organizer-apply"]')).toBeDisabled();
  await grid.getByRole("checkbox").check();
  await grid.locator('[data-opdf-action="organizer-apply"]').click();
  await expect(grid).toHaveCount(0);
  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({timeout:20000});
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute("data-opdf-total-pages", "3");
});
