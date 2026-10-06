import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { exportCurrentPdf, loadToolFixture } from "../helpers/tool-output";

async function mixedCorporatePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 48; index += 1) {
    const portrait = index % 3 !== 1;
    const width = portrait ? 595.28 : 841.89;
    const height = portrait ? 841.89 : 595.28;
    const page = pdf.addPage([width, height]);
    if (index % 7 === 0) page.setRotation(degrees(90));
    page.drawText(`CORPORATE MIXED FIXTURE PAGE ${index + 1}`, {
      x: 36,
      y: height - 48,
      size: 11,
      font,
    });
    page.drawText(`Department-${index % 8} Drawing-${String(index + 1).padStart(3, "0")}`, {
      x: 36,
      y: height - 70,
      size: 9,
      font,
    });
  }
  return Buffer.from(await pdf.save());
}

async function imageOnlyPdf() {
  const pdf = await PDFDocument.create();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
    "base64",
  );
  for (let index = 0; index < 8; index += 1) {
    const image = await pdf.embedPng(png);
    const page = pdf.addPage(index % 2 === 0 ? [612, 792] : [792, 612]);
    page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }
  return Buffer.from(await pdf.save());
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Adversarial corpus runs once on desktop Chromium.");
});

test("mixed page sizes, rotations, many pages and Unicode filename survive open/export/reopen", async ({ page }) => {
  test.setTimeout(90_000);
  const source = await mixedCorporatePdf();
  const fileName = "Hồ sơ Công ty - MEP_Kết cấu (Rev#03) [2026].pdf";
  await loadToolFixture(page, source, fileName);

  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute("data-opdf-total-pages", "48");
  const exported = await exportCurrentPdf(page);
  const firstPass = await PDFDocument.load(exported);
  expect(firstPass.getPageCount()).toBe(48);
  expect(firstPass.getPage(0).getRotation().angle).toBe(90);
  expect(firstPass.getPage(1).getSize()).toEqual({ width: 841.89, height: 595.28 });

  await page.goto("/");
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name: fileName,
    mimeType: "application/pdf",
    buffer: exported,
  });
  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute("data-opdf-total-pages", "48");
});

test("image-only scan-like PDF remains parseable and exportable", async ({ page }) => {
  const source = await imageOnlyPdf();
  await loadToolFixture(page, source, "scan-only_mixed-orientation.pdf");
  const output = await exportCurrentPdf(page);
  const pdf = await PDFDocument.load(output);
  expect(pdf.getPageCount()).toBe(8);
  expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  expect(pdf.getPage(1).getSize()).toEqual({ width: 792, height: 612 });
});

for (const [name, bytes] of [
  ["zero-byte.pdf", Buffer.alloc(0)],
  ["truncated.pdf", Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\n")],
  ["fake.pdf", Buffer.from("%PDF-this-is-not-a-real-document")],
] as const) {
  test(`invalid input ${name} does not crash the app and a valid PDF can still be opened afterward`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/");
    const input = page.locator('input[type="file"][accept="application/pdf"]').first();
    await input.setInputFiles({
      name,
      mimeType: "application/pdf",
      buffer: bytes,
    });
    await page.waitForTimeout(1500);

    await expect(page.locator("body")).toBeVisible();
    expect(pageErrors).toEqual([]);

    const recovery = await mixedCorporatePdf();
    await input.setInputFiles({
      name: "recovery.pdf",
      mimeType: "application/pdf",
      buffer: recovery,
    });
    await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute("data-opdf-total-pages", "48");
  });
}
