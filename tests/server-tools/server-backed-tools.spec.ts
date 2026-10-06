import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { unzipSync } from "fflate";
import {
  downloadBuffer,
  exportCurrentPdf,
  extractPdfTextPages,
  loadToolFixture,
  openAllTools,
  openDashboardTool,
} from "../helpers/tool-output";
import { buildOfficeFixtures, buildTestP12 } from "../helpers/server-tool-fixtures";

function assertOfficePackage(bytes: Uint8Array, format: "docx" | "xlsx" | "pptx") {
  expect(bytes[0]).toBe(0x50);
  expect(bytes[1]).toBe(0x4b);
  const entries = Object.keys(unzipSync(bytes));
  expect(entries).toContain("[Content_Types].xml");
  if (format === "docx") expect(entries).toContain("word/document.xml");
  if (format === "xlsx") expect(entries).toContain("xl/workbook.xml");
  if (format === "pptx") expect(entries).toContain("ppt/presentation.xml");
}

async function makeCompressiblePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let pageNumber = 1; pageNumber <= 12; pageNumber += 1) {
    const page = pdf.addPage([612, 792]);
    for (let row = 0; row < 45; row += 1) {
      page.drawText(`OPDF COMPRESSION CHECK PAGE ${pageNumber} ROW ${row} REPETITIVE CONTENT`, {
        x: 36,
        y: 750 - row * 15,
        size: 8,
        font,
      });
    }
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

test.describe("full OPDF Server tool UI", () => {
  test("PDF to Word/Excel/PowerPoint uses the real server converter and downloads valid Office packages", async ({ page }) => {
    await loadToolFixture(page);
    for (const [toolId, format] of [
      ["pdf-to-word", "docx"],
      ["pdf-to-excel", "xlsx"],
      ["pdf-to-ppt", "pptx"],
    ] as const) {
      await openDashboardTool(page, toolId);
      const panel = page.locator(`[data-opdf-panel="tool"][data-opdf-tool="${toolId}"]`);
      const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
      await panel.getByRole("button", { name: "Export File", exact: true }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename().toLowerCase().endsWith(`.${format}`)).toBeTruthy();
      const bytes = await downloadBuffer(download);
      assertOfficePackage(new Uint8Array(bytes), format);
      await panel.locator('[data-opdf-action="close-tool"]').click();
    }
  });

  test("Word/Excel/PowerPoint to PDF uses LibreOffice through the real UI", async ({ page }) => {
    const fixtures = await buildOfficeFixtures();
    await loadToolFixture(page);

    for (const [toolId, fixture] of [
      ["word-to-pdf", fixtures.docx],
      ["excel-to-pdf", fixtures.xlsx],
      ["ppt-to-pdf", fixtures.pptx],
    ] as const) {
      await openDashboardTool(page, toolId);
      const panel = page.locator(`[data-opdf-panel="tool"][data-opdf-tool="${toolId}"]`);
      const chooserPromise = page.waitForEvent("filechooser", { timeout: 10_000 });
      await panel.getByRole("button", { name: "Select File & Convert", exact: true }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles({
        name: fixture.name,
        mimeType: fixture.mimeType,
        buffer: fixture.bytes,
      });

      await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 90_000 });
      const output = await exportCurrentPdf(page);
      const pdf = await PDFDocument.load(output);
      expect(pdf.getPageCount()).toBeGreaterThan(0);
      const text = (await extractPdfTextPages(output)).join(" ");
      expect(text).toContain(fixture.marker);
      const close = panel.locator('[data-opdf-action="close-tool"]');
      if (await close.isVisible().catch(() => false)) await close.click();
    }
  });

  test("Compress PDF runs through the server and preserves a parseable document", async ({ page }) => {
    const source = await makeCompressiblePdf();
    await loadToolFixture(page, source, "compressible.pdf");
    await openDashboardTool(page, "compress-pdf");
    const panel = page.locator('[data-opdf-panel="tool"][data-opdf-tool="compress-pdf"]');
    await panel.locator('[data-opdf-action="compress-run"]').click();
    await expect(page.locator('[data-opdf-region="status-bar"]')).toContainText("PDF optimized successfully.", {
      timeout: 60_000,
    });

    const output = await exportCurrentPdf(page);
    expect(output.equals(source)).toBeFalsy();
    const pdf = await PDFDocument.load(output);
    expect(pdf.getPageCount()).toBe(12);
  });

  test("Protect then Unlock PDF works from the UI with the real server encryption engine", async ({ page }) => {
    await loadToolFixture(page);
    await openDashboardTool(page, "protect-pdf");
    let panel = page.locator('[data-opdf-panel="tool"][data-opdf-tool="protect-pdf"]');
    await panel.getByLabel("New password").fill("viewer-pass");
    await panel.getByLabel("Confirm password").fill("viewer-pass");
    await panel.getByRole("button", { name: "Protect PDF", exact: true }).click();
    await expect(page.locator('[data-opdf-region="status-bar"]')).toContainText("Password protection applied", {
      timeout: 30_000,
    });

    const protectedBytes = await exportCurrentPdf(page);
    await expect(async () => PDFDocument.load(protectedBytes)).rejects.toThrow();

    await panel.locator('[data-opdf-action="close-tool"]').click();
    await openDashboardTool(page, "unlock-pdf");
    panel = page.locator('[data-opdf-panel="tool"][data-opdf-tool="unlock-pdf"]');
    await panel.getByLabel("Current password").fill("viewer-pass");
    await panel.getByRole("button", { name: "Unlock PDF", exact: true }).click();
    await expect(page.locator('[data-opdf-region="status-bar"]')).toContainText("PDF unlocked", {
      timeout: 30_000,
    });

    const unlockedBytes = await exportCurrentPdf(page);
    const unlocked = await PDFDocument.load(unlockedBytes);
    expect(unlocked.getPageCount()).toBe(3);
  });

  test("OCR PDF runs from All Tools and returns a searchable parseable PDF", async ({ page }) => {
    await loadToolFixture(page);
    await openAllTools(page);
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page.locator('[data-opdf-tool-card="ocr-pdf"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename().toLowerCase().startsWith("ocr-")).toBeTruthy();
    const bytes = await downloadBuffer(download);
    const output = await PDFDocument.load(bytes);
    expect(output.getPageCount()).toBe(3);
    const text = (await extractPdfTextPages(bytes)).join(" ");
    expect(text).toContain("OPDF TOOL PAGE ONE KEEP");
  });

  test("Digital Sign verifies a P12, signs through server API, and inspects the signed PDF", async ({ page }) => {
    test.setTimeout(120_000);
    await loadToolFixture(page);
    await openDashboardTool(page, "sign-pdf");
    let dialog = page.locator('[data-opdf-dialog="digital-signature"]');
    await expect(dialog).toBeVisible();

    const passphrase = "opdf-ci";
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "opdf-ci.p12",
      mimeType: "application/x-pkcs12",
      buffer: buildTestP12(passphrase),
    });
    await dialog.getByPlaceholder("Certificate password").fill(passphrase);
    await dialog.getByRole("button", { name: "Verify certificate", exact: true }).click();
    await expect(dialog).toContainText("OPDF Server UI CI", { timeout: 30_000 });
    await dialog.getByLabel("Reason").fill("OPDF CI server UI approval");
    await dialog.getByRole("button", { name: "Digitally sign PDF", exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });

    const signedBytes = await exportCurrentPdf(page);
    const raw = Buffer.from(signedBytes);
    expect(raw.includes(Buffer.from("/ByteRange"))).toBeTruthy();
    expect(raw.includes(Buffer.from("/SubFilter /adbe.pkcs7.detached"))).toBeTruthy();

    await openDashboardTool(page, "sign-pdf");
    dialog = page.locator('[data-opdf-dialog="digital-signature"]');
    await dialog.getByRole("button", { name: "Inspect existing", exact: true }).click();
    await dialog.getByRole("button", { name: "Inspect signatures", exact: true }).click();
    await expect(dialog).toContainText("Signature 1", { timeout: 30_000 });
    await expect(dialog).toContainText("OPDF Server UI CI", { timeout: 30_000 });
  });
});
