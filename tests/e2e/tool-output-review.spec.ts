import { expect, test } from "@playwright/test";
import { PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";
import { clickApplicationMenuItem } from "../helpers/app-menu";
import {
  downloadBuffer,
  exportCurrentPdf,
  extractPdfTextPages,
  loadToolFixture,
  openDashboardTool,
} from "../helpers/tool-output";

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Real-output gate runs once on desktop Chromium.");
});

async function createFormPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([420, 320]);
  const form = pdf.getForm();
  const field = form.createTextField("customer_name");
  field.setText("");
  field.addToPage(page, { x: 60, y: 180, width: 240, height: 28 });
  page.drawText("Customer name", { x: 60, y: 220, size: 12 });
  return Buffer.from(await pdf.save());
}

async function createChangedRevision() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const sizes = [[300, 400], [400, 500], [500, 600]] as const;
  for (let index = 0; index < sizes.length; index += 1) {
    const [width, height] = sizes[index];
    const page = pdf.addPage([width, height]);
    page.drawText(`OPDF TOOL PAGE ${index + 1}`, {
      x: 28,
      y: height - 60,
      size: 14,
      font,
    });
    if (index === 0) {
      page.drawRectangle({
        x: 70,
        y: 110,
        width: 150,
        height: 150,
        color: rgb(0.9, 0.1, 0.1),
      });
      page.drawText("REVISION CHANGE", { x: 82, y: 180, size: 20, font });
    }
  }
  return Buffer.from(await pdf.save());
}

test("Fill Form writes an AcroForm value into the exported PDF", async ({ page }) => {
  await loadToolFixture(page, await createFormPdf(), "form-fixture.pdf");
  await openDashboardTool(page, "fill-form");
  const dialog = page.locator('[data-opdf-dialog="advanced-pdf"]');

  const fieldLabel = dialog.locator("label").filter({ hasText: "customer_name" }).first();
  await expect(fieldLabel).toBeVisible({ timeout: 15_000 });
  await fieldLabel.locator("input").fill("Alice Output Check");
  const apply = dialog.getByRole("button", { name: "Apply form values", exact: true });
  await apply.click();
  await expect(apply).toBeEnabled({ timeout: 10_000 });
  await dialog.locator('[data-opdf-action="close-dialog"]').first().click();

  const output = await PDFDocument.load(await exportCurrentPdf(page));
  expect(output.getForm().getTextField("customer_name").getText()).toBe("Alice Output Check");
});

test("Secure Redact removes the selected text from the resulting PDF text layer", async ({ page }) => {
  await loadToolFixture(page);
  await openDashboardTool(page, "redact-pdf");
  const dialog = page.locator('[data-opdf-dialog="search-redact"]');

  await dialog.locator('[data-opdf-field="redact-query"]').fill("OPDF TOOL PAGE TWO DELETE");
  await dialog.locator('[data-opdf-action="redact-search"]').click();
  await expect(dialog).toContainText("1 match(es) found", { timeout: 30_000 });
  await expect(dialog.locator('[data-opdf-action="redact-apply"]')).toBeEnabled();
  await dialog.locator('[data-opdf-action="redact-apply"]').click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });

  const textPages = await extractPdfTextPages(await exportCurrentPdf(page));
  expect(textPages.join(" ")).not.toContain("OPDF TOOL PAGE TWO DELETE");
  expect(textPages[0]).toContain("OPDF TOOL PAGE ONE KEEP");
  expect(textPages[2]).toContain("OPDF TOOL PAGE THREE KEEP");
});

test("Compare PDF detects a real visual revision and exports a valid comparison report", async ({ page }) => {
  test.setTimeout(90_000);
  await loadToolFixture(page);
  await openDashboardTool(page, "compare-pdf");
  const dialog = page.locator('[data-opdf-dialog="compare-revisions"]');

  await dialog.locator('input[type="file"]').setInputFiles({
    name: "changed-revision.pdf",
    mimeType: "application/pdf",
    buffer: await createChangedRevision(),
  });
  const detect = dialog.getByRole("button", { name: "Detect changes", exact: true });
  await expect(detect).toBeEnabled({ timeout: 20_000 });
  await detect.click();

  const exportButton = dialog.getByRole("button", { name: "Export report", exact: true });
  await expect(exportButton).toBeVisible({ timeout: 45_000 });
  const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("revision-comparison-page-1.pdf");
  const bytes = await downloadBuffer(download);
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
});

test("Advanced PDF embeds a real outline bookmark into the PDF catalog", async ({ page }) => {
  await loadToolFixture(page);
  await clickApplicationMenuItem(page, "Advanced PDF...");
  const dialog = page.locator('[data-opdf-dialog="advanced-pdf"]');

  await dialog.getByRole("button", { name: "bookmarks", exact: true }).click();
  await dialog.getByRole("button", { name: "+ Add bookmark", exact: true }).click();
  await dialog.locator('input[placeholder="Bookmark title"]').fill("OPDF BOOKMARK CHECK");
  const embed = dialog.getByRole("button", { name: "Embed bookmarks", exact: true });
  await embed.click();
  await expect(embed).toBeEnabled({ timeout: 10_000 });
  await dialog.locator('[data-opdf-action="close-dialog"]').first().click();

  const output = await PDFDocument.load(await exportCurrentPdf(page));
  expect(output.catalog.get(PDFName.of("Outlines"))).toBeTruthy();
});
