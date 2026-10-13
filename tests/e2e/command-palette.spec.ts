import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

test("command search opens with Ctrl+K and respects empty-document availability", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Find a command" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Find a command" }).fill("rotate");
  await expect(page.locator('[data-tpdf-command="rotate"]')).toBeDisabled();
  await expect(page.getByText("Open a PDF first").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.locator('[data-tpdf-action="search-commands"]').click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("open");
  await expect(page.locator('[data-tpdf-command="open"]')).toBeEnabled();
});

test("searching tools opens the real PDF panel without another UI engine", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([612, 792]).drawText("PALETTE OBJECT", { x: 60, y: 680, size: 20, font });
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name: "commands.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator('[data-tpdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox", { name: "Find a command" });
  await search.fill("crop");
  await expect(page.locator('[data-tpdf-command="crop"]')).toBeEnabled();
  await search.press("Enter");
  await expect(page.locator('[data-tpdf-command-palette="open"]')).toHaveCount(0);
  await expect(page.locator('[data-tpdf-panel="tool"][data-tpdf-tool="crop-pdf"]')).toBeVisible();
});

test("native inspector exposes object search and type filters on a small PDF", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([612, 792]).drawText("OBJECT FILTER", { x: 60, y: 680, size: 20, font });
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name: "inspector.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator('[data-tpdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-tpdf-action="edit-content"]').click();
  const expand = page.locator('[data-tpdf-action="expand-right-panel"]');
  if (await expand.isVisible()) await expand.click();
  await expect(page.locator('[data-tpdf-native-editor="true"]')).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Find PDF object" })).toBeVisible();
  await page.locator('[data-tpdf-object-filter="text"]').click();
  await expect(page.locator('[data-tpdf-object-filter="text"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-tpdf-object-kind="text"]')).not.toHaveCount(0);
  await page.locator('[data-tpdf-object-filter="image"]').click();
  await expect(page.locator('[data-tpdf-object-filter="image"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.native-content-editor__objects [data-tpdf-object-kind="text"]')).toHaveCount(0);
});
