import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const ALL_TOOL_IDS = [
  "pdf-to-word",
  "pdf-to-excel",
  "pdf-to-ppt",
  "pdf-to-png",
  "pdf-to-jpeg",
  "pdf-to-txt",
  "pdf-to-xml",
  "image-to-pdf",
  "txt-to-pdf",
  "word-to-pdf",
  "excel-to-pdf",
  "ppt-to-pdf",
  "compress-pdf",
  "merge-pdf",
  "split-pdf",
  "rotate-pdf",
  "delete-pages",
  "extract-pages",
  "crop-pdf",
  "watermark-pdf",
  "page-numbers",
  "ocr-pdf",
  "fill-form",
  "protect-pdf",
  "unlock-pdf",
  "redact-pdf",
  "compare-pdf",
  "sign-pdf",
] as const;

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

  const menuButton = page.locator('button[aria-label="Application menu"]:visible').first();
  await menuButton.click();
  const menu = page.locator('[role="menu"]:visible').first();
  await menu.locator('[data-opdf-menu-item="All Tools..."]').click();
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

test("All Tools dashboard exposes the complete 28-tool contract", async ({ page }) => {
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

test("every browser-capable dashboard tool reaches its real working surface or output", async ({ page }) => {
  test.setTimeout(120_000);
  await loadFixture(page);

  const panelTools = [
    "pdf-to-png",
    "pdf-to-jpeg",
    "merge-pdf",
    "split-pdf",
    "rotate-pdf",
    "delete-pages",
    "extract-pages",
    "crop-pdf",
    "watermark-pdf",
    "fill-form",
  ];

  for (const id of panelTools) {
    await openDashboard(page);
    await page.locator(`[data-opdf-tool-card="${id}"]`).click();
    await expect(page.locator(`[data-opdf-panel="tool"][data-opdf-tool="${id}"]`)).toBeVisible();
    await closeWorkingSurface(page);
  }

  await openDashboard(page);
  await page.locator('[data-opdf-tool-card="page-numbers"]').click();
  await expect(page.locator('[data-opdf-panel="markup"][data-opdf-tool="page-numbers"]')).toBeVisible();
  await closeWorkingSurface(page);

  for (const [id, dialog] of [
    ["redact-pdf", "search-redact"],
    ["compare-pdf", "compare-revisions"],
  ] as const) {
    await openDashboard(page);
    await page.locator(`[data-opdf-tool-card="${id}"]`).click();
    await expect(page.locator(`[data-opdf-dialog="${dialog}"]`)).toBeVisible();
    await closeWorkingSurface(page);
  }

  for (const id of ["pdf-to-txt", "pdf-to-xml"] as const) {
    await openDashboard(page);
    const downloadPromise = page.waitForEvent("download");
    await page.locator(`[data-opdf-tool-card="${id}"]`).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename().length).toBeGreaterThan(4);
    expect(await download.failure()).toBeNull();
  }

  await openDashboard(page);
  const imageChooserPromise = page.waitForEvent("filechooser");
  await page.locator('[data-opdf-tool-card="image-to-pdf"]').click();
  const imageChooser = await imageChooserPromise;
  await imageChooser.setFiles({
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

  await openDashboard(page);
  const textChooserPromise = page.waitForEvent("filechooser");
  await page.locator('[data-opdf-tool-card="txt-to-pdf"]').click();
  const textChooser = await textChooserPromise;
  await textChooser.setFiles({
    name: "tool-input.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("OPDF TXT TO PDF TOOL CHECK\nSecond line"),
  });
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute("data-opdf-total-pages", "1", {
    timeout: 20_000,
  });

  // OCR is already output-validated by the production E2E audit. Here we make
  // the dashboard contract fail if the browser-capable OCR entry disappears or
  // becomes disabled.
  await openDashboard(page);
  await expect(page.locator('[data-opdf-tool-card="ocr-pdf"]')).toBeEnabled();
});


async function openAppMenu(page: Page) {
  const button = page.locator('button[aria-label="Application menu"]:visible').first();
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  return page.locator('[role="menu"]:visible').first();
}

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

  let menu = await openAppMenu(page);
  for (const label of uniqueMenuTools) {
    const item = menu.locator(`[data-opdf-menu-item="${label}"]`);
    await expect(item, `missing menu-only tool: ${label}`).toHaveCount(1);
    await expect(item, `disabled menu-only tool: ${label}`).toBeEnabled();
  }
  await page.keyboard.press("Escape");

  menu = await openAppMenu(page);
  await menu.locator('[data-opdf-menu-item="Insert PDF..."]').click();
  await expect(page.locator('[data-opdf-dialog="insert-pdf"]')).toBeVisible();
  await closeWorkingSurface(page);

  for (const label of ["Header...", "Footer...", "Bates Numbering..."] as const) {
    menu = await openAppMenu(page);
    await menu.locator(`[data-opdf-menu-item="${label}"]`).click();
    await expect(page.locator('[data-opdf-panel="markup"]')).toBeVisible();
    await closeWorkingSurface(page);
  }

  menu = await openAppMenu(page);
  await menu.locator('[data-opdf-menu-item="Measure Drawing"]').click();
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute("data-opdf-active-tool", "measure");
  const closeMeasure = page.getByRole("button", { name: "Close measurement tool", exact: true });
  if (await closeMeasure.isVisible().catch(() => false)) await closeMeasure.click();

  menu = await openAppMenu(page);
  await menu.locator('[data-opdf-menu-item="Advanced PDF..."]').click();
  await expect(page.locator('[data-opdf-dialog="advanced-pdf"]')).toBeVisible();
  await closeWorkingSurface(page);

  // Edit PDF Content already has dedicated output/persistence E2E coverage and
  // AI Edit is covered by the AI workflow/audit. This contract assertion makes
  // their removal or accidental disabling fail the all-tools gate.
  menu = await openAppMenu(page);
  await expect(menu.locator('[data-opdf-menu-item="Edit PDF Content"]')).toBeEnabled();
  await expect(menu.locator('[data-opdf-menu-item="AI Edit"]')).toBeEnabled();
});
