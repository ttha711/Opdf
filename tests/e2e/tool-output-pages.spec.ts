import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { clickApplicationMenuItem } from "../helpers/app-menu";
import {
  createFixturePdf,
  downloadBuffer,
  exportCurrentPdf,
  loadToolFixture,
  openDashboardTool,
  waitForStatusText,
} from "../helpers/tool-output";

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Real-output gate runs once on desktop Chromium.");
});

test("Rotate PDF changes only the requested page in the exported PDF", async ({ page }) => {
  await loadToolFixture(page);
  await openDashboardTool(page, "rotate-pdf");
  const panel = page.locator('[data-opdf-panel="tool"][data-opdf-tool="rotate-pdf"]');
  await panel.locator('input[type="text"]').fill("2");
  await panel.getByRole("button", { name: /Rotate right/i }).click();
  await waitForStatusText(page, "Pages rotated.");

  const output = await PDFDocument.load(await exportCurrentPdf(page));
  expect(output.getPageCount()).toBe(3);
  expect(output.getPage(0).getRotation().angle).toBe(0);
  expect(output.getPage(1).getRotation().angle).toBe(90);
  expect(output.getPage(2).getRotation().angle).toBe(0);
});

test("Delete Pages removes the selected page and preserves the remaining order", async ({ page }) => {
  await loadToolFixture(page);
  await openDashboardTool(page, "delete-pages");
  const panel = page.locator('[data-opdf-panel="tool"][data-opdf-tool="delete-pages"]');
  await panel.locator('input[type="text"]').fill("2");
  await panel.getByRole("button", { name: "Delete pages", exact: true }).click();

  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute(
    "data-opdf-total-pages",
    "2",
    { timeout: 15_000 },
  );
  const output = await PDFDocument.load(await exportCurrentPdf(page));
  expect(output.getPageCount()).toBe(2);
  expect(output.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
  expect(output.getPage(1).getSize()).toEqual({ width: 500, height: 600 });
});

test("Extract Pages creates a new PDF containing exactly the requested pages", async ({ page }) => {
  await loadToolFixture(page);
  await openDashboardTool(page, "extract-pages");
  const panel = page.locator('[data-opdf-panel="tool"][data-opdf-tool="extract-pages"]');
  await panel.locator('input[type="text"]').fill("1, 3");
  await panel.getByRole("button", { name: "Extract pages", exact: true }).click();

  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute(
    "data-opdf-total-pages",
    "2",
    { timeout: 15_000 },
  );
  const output = await PDFDocument.load(await exportCurrentPdf(page));
  expect(output.getPageCount()).toBe(2);
  expect(output.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
  expect(output.getPage(1).getSize()).toEqual({ width: 500, height: 600 });
});

test("Crop PDF changes the selected page media box and leaves other pages unchanged", async ({ page }) => {
  await loadToolFixture(page);
  await openDashboardTool(page, "crop-pdf");
  const panel = page.locator('[data-opdf-panel="tool"][data-opdf-tool="crop-pdf"]');
  await panel.locator('input[type="text"]').fill("1");
  await panel.getByRole("button", { name: "Apply crop", exact: true }).click();
  await waitForStatusText(page, "Crop applied.");

  const output = await PDFDocument.load(await exportCurrentPdf(page));
  expect(output.getPage(0).getWidth()).toBeCloseTo(270, 3);
  expect(output.getPage(0).getHeight()).toBeCloseTo(360, 3);
  expect(output.getPage(1).getSize()).toEqual({ width: 400, height: 500 });
  expect(output.getPage(2).getSize()).toEqual({ width: 500, height: 600 });
});

test("Merge PDF combines the open document with another real PDF into one 5-page PDF", async ({ page }) => {
  await loadToolFixture(page);
  await openDashboardTool(page, "merge-pdf");
  const panel = page.locator('[data-opdf-panel="tool"][data-opdf-tool="merge-pdf"]');

  const extra = await createFixturePdf([
    { width: 210, height: 260, text: "MERGE EXTRA ONE" },
    { width: 220, height: 270, text: "MERGE EXTRA TWO" },
  ]);
  const chooserPromise = page.waitForEvent("filechooser");
  await panel.locator('[data-opdf-action="merge-add"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "merge-extra.pdf",
    mimeType: "application/pdf",
    buffer: extra,
  });
  await expect(panel.locator("[data-opdf-merge-item]")).toHaveCount(2, { timeout: 10_000 });
  await panel.locator('[data-opdf-action="merge-load"]').click();

  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute(
    "data-opdf-total-pages",
    "5",
    { timeout: 15_000 },
  );
  const output = await PDFDocument.load(await exportCurrentPdf(page));
  expect(output.getPageCount()).toBe(5);
  expect(output.getPage(3).getSize()).toEqual({ width: 210, height: 260 });
  expect(output.getPage(4).getSize()).toEqual({ width: 220, height: 270 });
});

test("Split PDF downloads a real PDF containing only the selected pages", async ({ page }) => {
  await loadToolFixture(page);
  await openDashboardTool(page, "split-pdf");
  const panel = page.locator('[data-opdf-panel="tool"][data-opdf-tool="split-pdf"]');

  await panel.locator('[data-opdf-field="split-mode-extract"]').check();
  await panel.locator('[data-opdf-field="split-extract"]').fill("1, 3");
  const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
  await panel.locator('[data-opdf-action="split-run"]').click();
  const bytes = await downloadBuffer(await downloadPromise);

  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  const output = await PDFDocument.load(bytes);
  expect(output.getPageCount()).toBe(2);
  expect(output.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
  expect(output.getPage(1).getSize()).toEqual({ width: 500, height: 600 });
});

test("Insert PDF inserts real pages at the selected location", async ({ page }) => {
  await loadToolFixture(page);
  await clickApplicationMenuItem(page, "Insert PDF...");
  const dialog = page.locator('[data-opdf-dialog="insert-pdf"]');

  const extra = await createFixturePdf([
    { width: 230, height: 280, text: "INSERT EXTRA ONE" },
    { width: 240, height: 290, text: "INSERT EXTRA TWO" },
  ]);
  await dialog.locator('[data-opdf-field="insert-file"]').setInputFiles({
    name: "insert-extra.pdf",
    mimeType: "application/pdf",
    buffer: extra,
  });
  await expect(dialog.locator('[data-opdf-action="insert-run"]')).toBeEnabled({ timeout: 10_000 });
  await dialog.locator('[data-opdf-field="insert-page"]').fill("2");
  await dialog.locator('[data-opdf-field="insert-after"]').check();
  await dialog.locator('[data-opdf-action="insert-run"]').click();

  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute(
    "data-opdf-total-pages",
    "5",
    { timeout: 15_000 },
  );
  const output = await PDFDocument.load(await exportCurrentPdf(page));
  expect(output.getPageCount()).toBe(5);
  expect(output.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
  expect(output.getPage(1).getSize()).toEqual({ width: 400, height: 500 });
  expect(output.getPage(2).getSize()).toEqual({ width: 230, height: 280 });
  expect(output.getPage(3).getSize()).toEqual({ width: 240, height: 290 });
  expect(output.getPage(4).getSize()).toEqual({ width: 500, height: 600 });
});
