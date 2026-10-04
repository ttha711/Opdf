import { chromium } from "playwright";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseURL = process.env.OPDF_UI_AUDIT_URL || "http://127.0.0.1:8787";
const outDir = resolve("ui-audit");
const samplePath = resolve("ui-audit", "sample-ui-audit.pdf");

await mkdir(outDir, { recursive: true });

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
for (let index = 0; index < 3; index += 1) {
  const page = pdf.addPage([595.28, 841.89]);
  page.drawText("OPDF UI Audit", { x: 54, y: 770, size: 28, font, color: rgb(0.12, 0.2, 0.34) });
  page.drawText("Sample page " + (index + 1), { x: 54, y: 720, size: 18, font });
  page.drawText("This document is generated automatically for visual QA.", { x: 54, y: 680, size: 12, font });
  page.drawRectangle({ x: 54, y: 560, width: 480, height: 80, borderWidth: 1 });
  page.drawText("Review block " + (index + 1), { x: 72, y: 600, size: 14, font });
}
await writeFile(samplePath, await pdf.save());

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

async function shot(name) {
  await page.screenshot({ path: resolve(outDir, name + ".png"), fullPage: true });
}

async function assertMainPdfSurface() {
  const viewer = page.locator('[data-opdf-engine="pdfium-wasm"]');
  await viewer.waitFor({ state: "visible", timeout: 30000 });

  let diagnostics = [];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    diagnostics = await viewer.locator("canvas").evaluateAll((canvases) =>
      canvases.map((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return {
          width: canvas.width,
          height: canvas.height,
          rectWidth: rect.width,
          rectHeight: rect.height,
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            getComputedStyle(canvas).display !== "none" &&
            getComputedStyle(canvas).visibility !== "hidden",
        };
      }),
    );

    if (diagnostics.some((item) =>
      item.visible &&
      item.width >= 250 &&
      item.height >= 250 &&
      item.rectWidth >= 220 &&
      item.rectHeight >= 220
    )) {
      console.log("Main PDF surface diagnostics:", diagnostics);
      return;
    }

    await page.waitForTimeout(250);
  }

  console.log("Main PDF surface diagnostics:", diagnostics);
  throw new Error("Main PDF page surface did not render a visible page-sized canvas");
}

async function openTopMenu(label) {
  const trigger = page.locator("button.top-menu-btn").filter({ hasText: new RegExp("^" + label + "$") });
  await trigger.click();
  const menu = page.getByRole("menu");
  await menu.waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(120);

  const visuallyReachable = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return false;
    const x = Math.min(window.innerWidth - 2, Math.max(1, rect.left + Math.min(20, rect.width / 2)));
    const y = Math.min(window.innerHeight - 2, Math.max(1, rect.top + Math.min(12, rect.height / 2)));
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit && element.contains(hit));
  });

  if (!visuallyReachable) {
    throw new Error(label + " menu is open in the DOM but clipped or visually occluded");
  }

  const menuItemsReachable = await menu.getByRole("menuitem").evaluateAll((items) =>
    items.every((item) => {
      const rect = item.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 10) return false;
      const x = Math.min(window.innerWidth - 2, Math.max(1, rect.left + 14));
      const y = Math.min(window.innerHeight - 2, Math.max(1, rect.top + rect.height / 2));
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit && item.contains(hit));
    }),
  );

  if (!menuItemsReachable) {
    throw new Error(label + " menu items are visually overlapped by another control");
  }
}

async function clickToolsAction(label) {
  await openTopMenu("Tools");
  const action = page.getByRole("menuitem", { name: label, exact: true });
  await action.scrollIntoViewIfNeeded();
  await action.click();
}

async function closeOverlay() {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
}

try {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await shot("01-dashboard-empty");

  const closeTools = page.getByRole("button", { name: /Close Tools/i });
  if (await closeTools.count()) await closeTools.first().click();

  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles(samplePath);

  await page.waitForFunction(() => document.body.innerText.includes("sample-ui-audit.pdf"), null, { timeout: 30000 });
  await page.waitForTimeout(1800);
  await assertMainPdfSurface();
  await shot("02-viewer-light");

  await openTopMenu("File");
  await page.waitForTimeout(250);
  await shot("03-file-menu");
  await page.keyboard.press("Escape");

  const darkToggle = page.locator('button[title^="Switch to Dark Mode"]').first();
  if (await darkToggle.count()) {
    await darkToggle.click();
    await page.waitForTimeout(350);
    await shot("04-viewer-dark");
  }

  await openTopMenu("Tools");
  await shot("05-tools-menu");
  await page.getByRole("menuitem", { name: "All Tools...", exact: true }).click();
  await page.waitForTimeout(350);
  await shot("06-dashboard-document");
  const close = page.getByRole("button", { name: /Close Tools/i });
  if (await close.count()) await close.first().click();

  const aiButton = page.locator('button[title="Open AI Assistant"]').first();
  if (await aiButton.count()) {
    await aiButton.click();
    await page.waitForTimeout(500);
    await shot("07-ai-panel");
    const aiClose = page.locator('button[title="Hide AI Copilot"]').first();
    if (await aiClose.count()) await aiClose.click();
  }

  await clickToolsAction("Split PDF...");
  await page.waitForTimeout(300);
  await shot("08-split-sidebar");
  await page.locator('button[title="Close tool"]').first().click();

  await clickToolsAction("Merge PDFs...");
  await page.waitForTimeout(300);
  await shot("09-merge-sidebar");
  await page.locator('button[title="Close tool"]').first().click();

  await clickToolsAction("Page Numbers...");
  await page.waitForTimeout(300);
  await shot("10-page-numbers-sidebar");
  await page.locator('button[title="Close tool"]').first().click();

  await clickToolsAction("Search & Secure Redact...");
  await page.waitForTimeout(300);
  await shot("11-redaction-modal");
  await closeOverlay();

  await clickToolsAction("Advanced PDF...");
  await page.waitForTimeout(300);
  await shot("12-advanced-pdf-modal");
  await closeOverlay();

  await clickToolsAction("Compare Revisions...");
  await page.waitForTimeout(500);
  await shot("13-revision-compare");
  await closeOverlay();

  console.log("UI audit screenshots written to", outDir);
} finally {
  await browser.close();
}
