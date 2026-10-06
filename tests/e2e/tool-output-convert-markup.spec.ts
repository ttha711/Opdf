import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import { clickApplicationMenuItem } from "../helpers/app-menu";
import {
  downloadBuffer,
  exportCurrentPdf,
  extractPdfTextPages,
  loadToolFixture,
  openDashboardTool,
  waitForStatusText,
} from "../helpers/tool-output";

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Real-output gate runs once on desktop Chromium.");
});

test("Watermark writes visible text into every exported PDF page", async ({ page }) => {
  await loadToolFixture(page);
  await openDashboardTool(page, "watermark-pdf");
  const panel = page.locator('[data-opdf-panel="tool"][data-opdf-tool="watermark-pdf"]');
  await panel.locator('[data-opdf-field="watermark-text"]').fill("OPDF-WATERMARK-CHECK");
  await panel.locator('[data-opdf-action="watermark-run"]').click();
  await waitForStatusText(page, /Watermark stamped|Watermark applied/i);

  const textPages = await extractPdfTextPages(await exportCurrentPdf(page));
  expect(textPages).toHaveLength(3);
  for (const text of textPages) expect(text).toContain("OPDF-WATERMARK-CHECK");
});

test("Page Numbers writes the configured sequence into the PDF", async ({ page }) => {
  await loadToolFixture(page);
  await openDashboardTool(page, "page-numbers");
  const panel = page.locator('[data-opdf-panel="markup"][data-opdf-tool="page-numbers"]');
  await panel.locator('[data-opdf-field="markup-prefix"]').fill("PN-");
  await panel.locator('[data-opdf-field="markup-start"]').fill("7");
  await panel.locator('[data-opdf-action="markup-apply"]').click();
  await expect(panel).toHaveAttribute("data-opdf-apply-sequence", "1", { timeout: 10_000 });

  const textPages = await extractPdfTextPages(await exportCurrentPdf(page));
  expect(textPages[0]).toContain("PN-7");
  expect(textPages[1]).toContain("PN-8");
  expect(textPages[2]).toContain("PN-9");
});

for (const [label, tool, marker] of [
  ["Header...", "header", "OPDF-HEADER-CHECK"],
  ["Footer...", "footer", "OPDF-FOOTER-CHECK"],
] as const) {
  test(`${tool} writes configured text into every PDF page`, async ({ page }) => {
    await loadToolFixture(page);
    await clickApplicationMenuItem(page, label);
    const panel = page.locator(`[data-opdf-panel="markup"][data-opdf-tool="${tool}"]`);
    await panel.locator('[data-opdf-field="markup-text"]').fill(marker);
    await panel.locator('[data-opdf-action="markup-apply"]').click();
    await expect(panel).toHaveAttribute("data-opdf-apply-sequence", "1", { timeout: 10_000 });

    const textPages = await extractPdfTextPages(await exportCurrentPdf(page));
    expect(textPages).toHaveLength(3);
    for (const text of textPages) expect(text).toContain(marker);
  });
}

test("Bates Numbering writes a unique sequential identifier on every page", async ({ page }) => {
  await loadToolFixture(page);
  await clickApplicationMenuItem(page, "Bates Numbering...");
  const panel = page.locator('[data-opdf-panel="markup"][data-opdf-tool="bates"]');
  await panel.locator('[data-opdf-field="markup-prefix"]').fill("BAT-");
  await panel.locator('[data-opdf-field="markup-start"]').fill("42");
  await panel.locator('[data-opdf-action="markup-apply"]').click();
  await expect(panel).toHaveAttribute("data-opdf-apply-sequence", "1", { timeout: 10_000 });

  const textPages = await extractPdfTextPages(await exportCurrentPdf(page));
  expect(textPages[0]).toContain("BAT-000042");
  expect(textPages[1]).toContain("BAT-000043");
  expect(textPages[2]).toContain("BAT-000044");
});

for (const [toolId, extension] of [
  ["pdf-to-png", "png"],
  ["pdf-to-jpeg", "jpg"],
] as const) {
  test(`${toolId} downloads a ZIP containing one real image per PDF page`, async ({ page }) => {
    await loadToolFixture(page);
    await openDashboardTool(page, toolId);
    const panel = page.locator(`[data-opdf-panel="tool"][data-opdf-tool="${toolId}"]`);

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await panel.getByRole("button", { name: new RegExp(`Convert to ${extension === "png" ? "PNG" : "JPG"}`, "i") }).click();
    const zipBytes = await downloadBuffer(await downloadPromise);
    const files = unzipSync(new Uint8Array(zipBytes));
    const names = Object.keys(files).sort();

    expect(names).toHaveLength(3);
    expect(names.every((name) => name.endsWith(`.${extension}`))).toBeTruthy();
    for (const name of names) {
      const bytes = files[name];
      expect(bytes.length).toBeGreaterThan(50);
      if (extension === "png") {
        expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      } else {
        expect(Array.from(bytes.subarray(0, 3))).toEqual([255, 216, 255]);
      }
    }
  });
}

for (const [toolId, expectedExtension] of [
  ["pdf-to-txt", ".txt"],
  ["pdf-to-xml", ".xml"],
] as const) {
  test(`${toolId} downloads extracted text from the real PDF`, async ({ page }) => {
    await loadToolFixture(page);
    await openDashboardTool(page, toolId);
    const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
    await page.locator(`[data-opdf-tool-card="${toolId}"]`).click().catch(() => {});
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\${expectedExtension}$`, "i"));
    const text = (await downloadBuffer(download)).toString("utf8");
    expect(text).toContain("OPDF TOOL PAGE ONE KEEP");
    expect(text).toContain("OPDF TOOL PAGE TWO DELETE");
    expect(text).toContain("OPDF TOOL PAGE THREE KEEP");
  });
}

test("Image to PDF creates a valid PDF with the source image dimensions", async ({ page }) => {
  await loadToolFixture(page);
  await openDashboardTool(page, "image-to-pdf");
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 10_000 });
  await page.locator('[data-opdf-tool-card="image-to-pdf"]').click().catch(() => {});
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute("data-opdf-total-pages", "1", {
    timeout: 20_000,
  });

  const output = await PDFDocument.load(await exportCurrentPdf(page));
  expect(output.getPageCount()).toBe(1);
  expect(output.getPage(0).getWidth()).toBeCloseTo(1, 2);
  expect(output.getPage(0).getHeight()).toBeCloseTo(1, 2);
});

test("TXT to PDF creates a valid PDF containing the source text", async ({ page }) => {
  await loadToolFixture(page);
  await openDashboardTool(page, "txt-to-pdf");
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 10_000 });
  await page.locator('[data-opdf-tool-card="txt-to-pdf"]').click().catch(() => {});
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "tool-input.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("OPDF TXT TO PDF OUTPUT CHECK\nSecond line"),
  });
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute("data-opdf-total-pages", "1", {
    timeout: 20_000,
  });

  const outputBytes = await exportCurrentPdf(page);
  expect((await PDFDocument.load(outputBytes)).getPageCount()).toBe(1);
  expect((await extractPdfTextPages(outputBytes))[0]).toContain("OPDF TXT TO PDF OUTPUT CHECK");
});
