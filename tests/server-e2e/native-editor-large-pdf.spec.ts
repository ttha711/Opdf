import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { saveServerDocumentAndWait } from "../helpers/save";

test.setTimeout(180_000);

async function makeMultiPagePdf(count: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= count; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(i === 1 ? "Large PDF original text" : `Page ${i} sentinel`, {
      x: 60, y: 720, size: 18, font,
    });
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

async function openNativeEditor(page: Page) {
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 45_000 });
  await page.getByTitle("Edit PDF Content").click();
  const expand = page.locator('[data-opdf-action="expand-right-panel"]');
  await expect(expand).toBeVisible({ timeout: 30_000 });
  await expand.click();
  const editor = page.locator("[data-opdf-native-editor='true']");
  await expect(editor).toBeVisible({ timeout: 30_000 });
  return editor;
}

async function goToPage(page: Page, target: number) {
  // The desktop Pages trigger is CSS-hidden, but its handler uses the real
  // viewer goToPage API. Dispatch a DOM click to exercise that API without
  // assuming virtualized page DOM nodes or scroll container internals.
  const trigger = page.locator('[data-opdf-action="toggle-page-filmstrip"]');
  await expect(trigger).toBeAttached({ timeout: 10_000 });
  await trigger.evaluate((element: HTMLElement) => element.click());
  const option = page.locator(`[data-opdf-page-thumb="${target}"]`);
  await expect(option).toBeAttached({ timeout: 10_000 });
  await option.evaluate((element: HTMLElement) => element.click());
  await expect(page.locator('[data-opdf-region="status-bar"]'))
    .toHaveAttribute("data-opdf-page", String(target), { timeout: 20_000 });
}

test("90-page native text replacement persists after save and reload", async ({ page, request }) => {
  const pdf = await makeMultiPagePdf(90);
  const upload = await request.post("/api/opdf/documents?name=large-editor-regression.pdf", {
    headers: { "Content-Type": "application/pdf" }, data: pdf,
  });
  expect(upload.status()).toBe(201);
  const stored = await upload.json();

  const failures: string[] = [];
  let fetches = 0;
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("ERR_INSUFFICIENT_RESOURCES")) {
      failures.push(message.text());
    }
  });
  page.on("request", (req) => {
    if (req.method() === "GET" && new URL(req.url()).pathname.startsWith("/api/opdf/documents/")) fetches++;
  });

  await page.goto("/?open=" + encodeURIComponent(stored.filePath));
  let editor = await openNativeEditor(page);
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute("data-opdf-total-pages", "90");

  const original = editor.locator("[data-opdf-object-kind='text']")
    .filter({ hasText: "Large PDF original text" }).first();
  await expect(original).toBeVisible({ timeout: 30_000 });
  await original.click();
  await editor.locator("textarea").fill("Large PDF edited text");
  await editor.getByRole("button", { name: "Apply text" }).click();
  await expect(editor.getByText("Native PDF text updated.")).toBeVisible({ timeout: 30_000 });

  // Saving is independent of navigation; verify it even if navigation later regresses.
  expect(fetches).toBeLessThan(15);
  expect(failures).toEqual([]);

  await saveServerDocumentAndWait(page);
  await page.reload();
  editor = await openNativeEditor(page);
  const persisted = editor.locator("[data-opdf-object-kind='text']")
    .filter({ hasText: "Large PDF edited text" }).first();
  await expect(persisted).toBeVisible({ timeout: 30_000 });
  await expect(editor.getByText("Large PDF original text")).toHaveCount(0);
  expect(failures).toEqual([]);
});

test("90-page virtualized navigation remains responsive without fetch flooding", async ({ page, request }) => {
  const upload = await request.post("/api/opdf/documents?name=large-editor-scroll.pdf", {
    headers: { "Content-Type": "application/pdf" }, data: await makeMultiPagePdf(90),
  });
  expect(upload.status()).toBe(201);
  const stored = await upload.json();

  let fetches = 0;
  const failures: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "GET" &&
        new URL(req.url()).pathname.startsWith("/api/opdf/documents/")) fetches++;
  });
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("ERR_INSUFFICIENT_RESOURCES")) {
      failures.push(msg.text());
    }
  });

  await page.goto("/?open=" + encodeURIComponent(stored.filePath));
  await openNativeEditor(page);
  await expect(page.locator('[data-opdf-region="status-bar"]'))
    .toHaveAttribute("data-opdf-total-pages", "90");
  // Virtualized viewers should not retain one DOM page for every document page.
  expect(await page.locator(".native-edit-page").count()).toBeLessThan(90);

  const heapSamples: number[] = [];
  for (const target of [45, 90, 2, 1]) {
    await goToPage(page, target);
    const heap = await page.evaluate(() =>
      (performance as Performance & { memory?: { usedJSHeapSize: number } })
        .memory?.usedJSHeapSize ?? null);
    if (heap !== null) heapSamples.push(Math.round(heap / 1048576));
  }
  console.log(JSON.stringify({ documentFetches: fetches, heapMiB: heapSamples }));
  expect(fetches).toBeLessThan(15);
  expect(failures).toEqual([]);
});

test("dense CAD-style page keeps raster visible and bounds interactive DOM", async ({ page, request }) => {
  const pdf = await PDFDocument.create();
  const canvas = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 1600; i++) {
    const x = 30 + (i % 50) * 10;
    const y = 120 + Math.floor(i / 50) * 15;
    canvas.drawLine({
      start: { x, y }, end: { x: x + 7, y: y + 6 }, thickness: 0.2,
    });
  }
  canvas.drawText("CAD title block", { x: 60, y: 740, size: 18, font });
  const upload = await request.post("/api/opdf/documents?name=cad-overlay-budget.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: Buffer.from(await pdf.save({ useObjectStreams: false })),
  });
  expect(upload.status()).toBe(201);
  const stored = await upload.json();
  await page.goto("/?open=" + encodeURIComponent(stored.filePath));
  const editor = await openNativeEditor(page);

  // A headless PDF viewer must paint the page itself, not just mount
  // transparent editing polygons over a blank white page.
  await expect(page.locator(".native-edit-page canvas, .native-edit-page img").first())
    .toBeVisible({ timeout: 60_000 });
  const polygons = page.locator("polygon.native-edit-object");
  await expect(polygons.first()).toBeAttached({ timeout: 45_000 });
  expect(await polygons.count()).toBeLessThanOrEqual(500);
  await expect(page.locator("polygon[data-opdf-object-kind='text']")).toHaveCount(1);

  // The properties sidebar must not create another 1600 buttons at once.
  const objectButtons = editor.locator(".native-content-editor__objects button[data-opdf-object-id]");
  expect(await objectButtons.count()).toBeLessThanOrEqual(201);
  await editor.getByRole("searchbox", { name: "Find PDF object" }).fill("CAD title block");
  await expect(editor.locator(".native-content-editor__objects button[data-opdf-object-kind='text']"))
    .toHaveCount(1);
});
