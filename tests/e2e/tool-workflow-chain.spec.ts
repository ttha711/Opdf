import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import {
  createFixturePdf,
  exportCurrentPdf,
  extractPdfTextPages,
  loadToolFixture,
  openDashboardTool,
} from "../helpers/tool-output";

async function closeTool(page: import("@playwright/test").Page) {
  const close = page.locator('[data-opdf-action="close-tool"]:visible').first();
  if (await close.isVisible().catch(() => false)) await close.click();
}

test("multi-tool workflow preserves every edit through export and reopen", async ({ page }) => {
  test.skip(test.info().project.name !== "chromium", "Workflow chain runs once on desktop Chromium.");
  test.setTimeout(120_000);

  await loadToolFixture(page);

  await openDashboardTool(page, "merge-pdf");
  let panel = page.locator('[data-opdf-panel="tool"][data-opdf-tool="merge-pdf"]');
  const extra = await createFixturePdf([
    { width: 260, height: 360, text: "CHAIN MERGE FOUR" },
    { width: 270, height: 370, text: "CHAIN MERGE FIVE" },
  ]);
  const chooserPromise = page.waitForEvent("filechooser");
  await panel.locator('[data-opdf-action="merge-add"]').click();
  await (await chooserPromise).setFiles({
    name: "chain-extra.pdf",
    mimeType: "application/pdf",
    buffer: extra,
  });
  await expect(panel.locator("[data-opdf-merge-item]")).toHaveCount(2);
  await panel.locator('[data-opdf-action="merge-load"]').click();
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute("data-opdf-total-pages", "5");
  await closeTool(page);

  await openDashboardTool(page, "rotate-pdf");
  panel = page.locator('[data-opdf-panel="tool"][data-opdf-tool="rotate-pdf"]');
  await panel.getByLabel("Pages").fill("2");
  await panel.getByRole("button", { name: /Rotate right/i }).click();
  await expect(page.locator('[data-opdf-region="status-bar"]')).toContainText("Pages rotated.");
  await closeTool(page);

  await openDashboardTool(page, "delete-pages");
  panel = page.locator('[data-opdf-panel="tool"][data-opdf-tool="delete-pages"]');
  await panel.getByLabel("Pages").fill("4");
  await panel.getByRole("button", { name: "Delete pages", exact: true }).click();
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute("data-opdf-total-pages", "4");
  await closeTool(page);

  await openDashboardTool(page, "watermark-pdf");
  panel = page.locator('[data-opdf-panel="tool"][data-opdf-tool="watermark-pdf"]');
  await panel.locator('[data-opdf-field="watermark-text"]').fill("CHAIN-WM");
  await panel.locator('[data-opdf-field="watermark-size"]').fill("18");
  await panel.locator('[data-opdf-action="watermark-run"]').click();
  await expect(page.locator('[data-opdf-region="status-bar"]')).toContainText(/Watermark stamped|Watermark applied/i);
  await closeTool(page);

  await openDashboardTool(page, "page-numbers");
  panel = page.locator('[data-opdf-panel="markup"][data-opdf-tool="page-numbers"]');
  await panel.locator('[data-opdf-field="markup-prefix"]').fill("CHAIN-");
  await panel.locator('[data-opdf-field="markup-start"]').fill("10");
  await panel.locator('[data-opdf-action="markup-apply"]').click();
  await expect(panel).toHaveAttribute("data-opdf-apply-sequence", "1");

  const exported = await exportCurrentPdf(page);
  const pdf = await PDFDocument.load(exported);
  expect(pdf.getPageCount()).toBe(4);
  expect(pdf.getPage(1).getRotation().angle).toBe(90);
  expect(pdf.getPage(3).getSize()).toEqual({ width: 270, height: 370 });

  const textPages = await extractPdfTextPages(exported);
  expect(textPages).toHaveLength(4);
  for (const [index, text] of textPages.entries()) {
    expect(text).toContain("CHAIN-WM");
    expect(text).toContain(`CHAIN-${10 + index}`);
  }
  expect(textPages.join(" ")).not.toContain("CHAIN MERGE FOUR");
  expect(textPages.join(" ")).toContain("CHAIN MERGE FIVE");

  await page.goto("/");
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name: "chain-result.pdf",
    mimeType: "application/pdf",
    buffer: exported,
  });
  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute("data-opdf-total-pages", "4");
  const reopened = await exportCurrentPdf(page);
  expect(Buffer.from(reopened).length).toBeGreaterThan(0);
  const reopenedPdf = await PDFDocument.load(reopened);
  expect(reopenedPdf.getPageCount()).toBe(4);
  expect(reopenedPdf.getPage(1).getRotation().angle).toBe(90);
});
