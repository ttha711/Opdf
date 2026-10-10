import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";

test("web Save downloads the actual native-edited PDF", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([612, 792]).drawText("BEFORE EDIT", { x: 72, y: 700, size: 24, font });
  const original = Buffer.from(await pdf.save());
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name: "native-save.pdf",
    mimeType: "application/pdf",
    buffer: original,
  });

  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-opdf-action="edit-content"]').click();
  const object = page.locator('[data-opdf-canvas-object][data-opdf-object-kind="text"]').first();
  await expect(object).toBeVisible({ timeout: 30_000 });
  await object.dblclick();
  const editor = page.locator('[data-opdf-inline-text-editor="true"]');
  await expect(editor).toBeVisible();
  await editor.fill("AFTER NATIVE EDIT");
  await editor.press("Enter");
  await expect(editor).toHaveCount(0, { timeout: 20_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    page.getByRole("button", { name: "Save now" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("native-save.pdf");
  const savedBytes = await readFile(await download.path());
  expect(savedBytes.equals(original)).toBe(false);
  expect((await PDFDocument.load(savedBytes)).getPageCount()).toBe(1);
});
