import { expect, type Download, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { clickApplicationMenuItem } from "./app-menu";

export type FixturePage = {
  width: number;
  height: number;
  text: string;
};

export const DEFAULT_TOOL_PAGES: FixturePage[] = [
  { width: 300, height: 400, text: "OPDF TOOL PAGE ONE KEEP" },
  { width: 400, height: 500, text: "OPDF TOOL PAGE TWO DELETE" },
  { width: 500, height: 600, text: "OPDF TOOL PAGE THREE KEEP" },
];

export async function createFixturePdf(pages: FixturePage[] = DEFAULT_TOOL_PAGES) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const item of pages) {
    const page = pdf.addPage([item.width, item.height]);
    page.drawText(item.text, {
      x: 28,
      y: Math.max(60, item.height - 60),
      size: 14,
      font,
    });
  }
  return Buffer.from(await pdf.save());
}

export async function loadToolFixture(
  page: Page,
  bytes?: Buffer,
  fileName = "tool-output-fixture.pdf",
) {
  await page.addInitScript(() => {
    let target: any = window;
    while (target) {
      try {
        Reflect.deleteProperty(target, "showSaveFilePicker");
      } catch {
        // Best effort. Headless Chromium normally has no picker.
      }
      target = Object.getPrototypeOf(target);
    }
  });
  await page.goto("/");
  const source = bytes ?? await createFixturePdf();
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name: fileName,
    mimeType: "application/pdf",
    buffer: source,
  });
  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute(
    "data-opdf-total-pages",
    String((await PDFDocument.load(source)).getPageCount()),
    { timeout: 20_000 },
  );
}

export async function openAllTools(page: Page) {
  const visibleCard = page.locator("[data-opdf-tool-card]:visible").first();
  if (await visibleCard.isVisible().catch(() => false)) return;
  await clickApplicationMenuItem(page, "All Tools...");
  await expect(page.locator("[data-opdf-tool-card]").first()).toBeVisible({
    timeout: 10_000,
  });
}

export async function openDashboardTool(page: Page, toolId: string) {
  await openAllTools(page);
  const card = page.locator(`[data-opdf-tool-card="${toolId}"]`);
  await expect(card).toBeEnabled();
  await card.click();
}

export async function downloadBuffer(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Download stream is unavailable.");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function exportCurrentPdf(page: Page) {
  const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
  await clickApplicationMenuItem(page, "Export PDF...");
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  const bytes = await downloadBuffer(download);
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  return bytes;
}

export async function extractPdfTextPages(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const pdfPage = await pdf.getPage(pageNumber);
    const textContent = await pdfPage.getTextContent();
    pages.push(
      textContent.items
        .map((item: any) => ("str" in item ? String(item.str) : ""))
        .filter(Boolean)
        .join(" "),
    );
  }
  await pdf.destroy();
  return pages;
}

export async function waitForStatusText(page: Page, text: string | RegExp) {
  await expect(page.locator('[data-opdf-region="status-bar"]')).toContainText(text, {
    timeout: 15_000,
  });
}
