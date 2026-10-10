import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { ALL_TOOLS_CATALOG } from "../../apps/web/src/lib/allToolsCatalog";
import { clickApplicationMenuItem, getApplicationMenuItem } from "../helpers/app-menu";

const ALL_TOOL_IDS = ALL_TOOLS_CATALOG.map((tool) => tool.id);

const BROWSER_UNAVAILABLE = new Set([
  "pdf-to-word",
  "pdf-to-excel",
  "pdf-to-ppt",
  "word-to-pdf",
  "excel-to-pdf",
  "ppt-to-pdf",
  "compress-pdf",
  "protect-pdf",
  "unlock-pdf",
  "sign-pdf",
  "rtf-to-pdf",
  "normalize",
]);

async function samplePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
    const page = pdf.addPage([612, 792]);
    page.drawText(`OPDF ALL TOOLS PAGE ${pageNumber}`, { x: 72, y: 700, size: 20, font });
    page.drawText(pageNumber === 1 ? "SECRET-TOOLS-CHECK" : "Functional tool fixture", {
      x: 72,
      y: 650,
      size: 12,
      font,
    });
  }
  return Buffer.from(await pdf.save());
}

async function loadFixture(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name: "all-tools-fixture.pdf",
    mimeType: "application/pdf",
    buffer: await samplePdf(),
  });
  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute("data-opdf-total-pages", "3", {
    timeout: 20_000,
  });
}

async function openDashboard(page: Page) {
  const anyCard = page.locator("[data-opdf-tool-card]").first();
  if (await anyCard.isVisible().catch(() => false)) return;

  await clickApplicationMenuItem(page, "All Tools...");
  await expect(page.locator("[data-opdf-tool-card]").first()).toBeVisible();
}

async function closeWorkingSurface(page: Page) {
  const closeTool = page.locator('[data-opdf-action="close-tool"]:visible').first();
  if (await closeTool.isVisible().catch(() => false)) {
    await closeTool.click();
    return;
  }
  const closeDialog = page.locator('[data-opdf-action="close-dialog"]:visible').first();
  if (await closeDialog.isVisible().catch(() => false)) {
    await closeDialog.click();
  }
}

test("All Tools dashboard exposes the complete 41-tool contract", async ({ page }) => {
  await loadFixture(page);
  await openDashboard(page);

  const cards = page.locator("[data-opdf-tool-card]");
  await expect(cards).toHaveCount(ALL_TOOL_IDS.length);

  const ids = await cards.evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-opdf-tool-card")).filter(Boolean).sort(),
  );
  expect(ids).toEqual([...ALL_TOOL_IDS].sort());

  for (const id of ALL_TOOL_IDS) {
    const card = page.locator(`[data-opdf-tool-card="${id}"]`);
    await expect(card).toHaveCount(1);
    if (BROWSER_UNAVAILABLE.has(id)) {
      await expect(card).toBeDisabled();
      await expect(card).toHaveAttribute("data-opdf-tool-available", "false");
    } else {
      await expect(card).toBeEnabled();
      await expect(card).toHaveAttribute("data-opdf-tool-available", "true");
    }
  }
});

test("All Tools: search filters by intent and can reset without reopening", async ({ page }) => {
  await loadFixture(page);
  await openDashboard(page);
  const search = page.getByRole("searchbox", { name: "Search PDF tools" });
  await search.fill("watermark");
  await expect(page.locator("[data-opdf-tool-card]")).toHaveCount(1);
  await expect(page.locator('[data-opdf-tool-card="watermark-pdf"]')).toBeVisible();
  await search.fill("no-such-tool");
  await expect(page.getByText("No matching tools.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("[data-opdf-tool-card]")).toHaveCount(ALL_TOOL_IDS.length);
});

const PANEL_TOOL_IDS = [
  "pdf-to-png",
  "pdf-to-jpeg",
  "merge-pdf",
  "split-pdf",
  "rotate-pdf",
  "delete-pages",
  "extract-pages",
  "crop-pdf",
  "watermark-pdf",
] as const;

for (const id of PANEL_TOOL_IDS) {
  test(`All Tools: ${id} opens its working panel`, async ({ page }) => {
    await loadFixture(page);
    await openDashboard(page);
    await page.locator(`[data-opdf-tool-card="${id}"]`).click();
    await expect(
      page.locator(`[data-opdf-panel="tool"][data-opdf-tool="${id}"]`),
    ).toBeVisible({ timeout: 10_000 });
  });
}

test("All Tools: page-numbers opens the markup panel", async ({ page }) => {
  await loadFixture(page);
  await openDashboard(page);
  await page.locator('[data-opdf-tool-card="page-numbers"]').click();
  await expect(
    page.locator('[data-opdf-panel="markup"][data-opdf-tool="page-numbers"]'),
  ).toBeVisible({ timeout: 10_000 });
});

for (const [id, dialog] of [
  ["fill-form", "advanced-pdf"],
  ["redact-pdf", "search-redact"],
  ["compare-pdf", "compare-revisions"],
] as const) {
  test(`All Tools: ${id} opens ${dialog}`, async ({ page }) => {
    await loadFixture(page);
    await openDashboard(page);
    await page.locator(`[data-opdf-tool-card="${id}"]`).click();
    await expect(page.locator(`[data-opdf-dialog="${dialog}"]`)).toBeVisible({
      timeout: 10_000,
    });
  });
}

for (const id of ["pdf-to-txt", "pdf-to-xml"] as const) {
  test(`All Tools: ${id} produces a download`, async ({ page }) => {
    await loadFixture(page);
    await openDashboard(page);
    const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
    await page.locator(`[data-opdf-tool-card="${id}"]`).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename().length).toBeGreaterThan(4);
    expect(await download.failure()).toBeNull();
  });
}

test("All Tools: image-to-pdf converts a real PNG into a PDF", async ({ page }) => {
  await loadFixture(page);
  await openDashboard(page);
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 10_000 });
  await page.locator('[data-opdf-tool-card="image-to-pdf"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute(
    "data-opdf-total-pages",
    "1",
    { timeout: 20_000 },
  );
});

test("All Tools: txt-to-pdf converts a real text file into a PDF", async ({ page }) => {
  await loadFixture(page);
  await openDashboard(page);
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 10_000 });
  await page.locator('[data-opdf-tool-card="txt-to-pdf"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "tool-input.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("OPDF TXT TO PDF TOOL CHECK\nSecond line"),
  });
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute(
    "data-opdf-total-pages",
    "1",
    { timeout: 20_000 },
  );
});

test("All Tools: OCR entry is available in browser runtime", async ({ page }) => {
  await loadFixture(page);
  await openDashboard(page);
  await expect(page.locator('[data-opdf-tool-card="ocr-pdf"]')).toBeEnabled();
});


test("menu-only tools are all reachable from the real application menu", async ({ page }) => {
  test.setTimeout(90_000);
  await loadFixture(page);

  const uniqueMenuTools = [
    "Insert PDF...",
    "Header...",
    "Footer...",
    "Bates Numbering...",
    "Edit PDF Content",
    "Measure Drawing",
    "Advanced PDF...",
    "AI Edit",
  ];

  for (const label of uniqueMenuTools) {
    const item = await getApplicationMenuItem(page, label);
    await expect(item, `missing menu-only tool: ${label}`).toBeVisible();
    await expect(item, `disabled menu-only tool: ${label}`).toBeEnabled();
    await page.keyboard.press("Escape");
  }

  await clickApplicationMenuItem(page, "Insert PDF...");
  await expect(page.locator('[data-opdf-dialog="insert-pdf"]')).toBeVisible();
  await closeWorkingSurface(page);

  for (const [label, tool] of [
    ["Header...", "header"],
    ["Footer...", "footer"],
    ["Bates Numbering...", "bates"],
  ] as const) {
    await clickApplicationMenuItem(page, label);
    await expect(page.locator(`[data-opdf-panel="markup"][data-opdf-tool="${tool}"]`)).toBeVisible();
    await closeWorkingSurface(page);
  }

  await clickApplicationMenuItem(page, "Measure Drawing");
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute("data-opdf-active-tool", "measure");
  const closeMeasure = page.getByRole("button", { name: "Close measurement tool", exact: true });
  if (await closeMeasure.isVisible().catch(() => false)) await closeMeasure.click();

  await clickApplicationMenuItem(page, "Advanced PDF...");
  await expect(page.locator('[data-opdf-dialog="advanced-pdf"]')).toBeVisible();
  await closeWorkingSurface(page);

  for (const label of ["Edit PDF Content", "AI Edit"] as const) {
    const item = await getApplicationMenuItem(page, label);
    await expect(item).toBeEnabled();
    await page.keyboard.press("Escape");
  }
});
