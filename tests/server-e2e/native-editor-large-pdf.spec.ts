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

async function goToPage(page: Page, target: number, totalPages: number) {
  // EmbedPDF virtualizes page DOM nodes. Scroll the viewport, not an off-screen page.
  const viewport = page.locator(".native-edit-viewport");
  const status = page.locator('[data-opdf-region="status-bar"]');
  await expect(viewport).toBeVisible({ timeout: 15_000 });
  const history: Array<{ before: number; after: number; top: number; range: number }> = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const before = Number(await status.getAttribute("data-opdf-page"));
    if (before === target) return;
    const result = await viewport.evaluate((root, args) => {
      const candidates = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]
        .filter((element) => element.clientHeight > 50 &&
          element.scrollHeight - element.clientHeight > 100);
      // The virtualized Scroller occupies a large scrollable layout inside Viewport.
      const scrolling = candidates.sort((a, b) =>
        (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
      if (!scrolling) {
        throw new Error("Native PDF viewport has no scrollable content.");
      }
      const range = scrolling.scrollHeight - scrolling.clientHeight;
      const pageStride = scrolling.scrollHeight / args.totalPages;
      const top = Math.max(0, Math.min(range,
        scrolling.scrollTop + (args.target - args.before) * pageStride));
      scrolling.scrollTo({ top, behavior: "instant" });
      return { top, range };
    }, { target, totalPages, before });
    await page.waitForTimeout(250);
    const after = Number(await status.getAttribute("data-opdf-page"));
    history.push({ before, after, ...result });
    if (after === target) return;
    if (after === before && attempt >= 3) break;
  }
  throw new Error(`Could not reach page ${target}; scroll history: ${JSON.stringify(history)}`);
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
    await goToPage(page, target, 90);
    const heap = await page.evaluate(() =>
      (performance as Performance & { memory?: { usedJSHeapSize: number } })
        .memory?.usedJSHeapSize ?? null);
    if (heap !== null) heapSamples.push(Math.round(heap / 1048576));
  }
  console.log(JSON.stringify({ documentFetches: fetches, heapMiB: heapSamples }));
  expect(fetches).toBeLessThan(15);
  expect(failures).toEqual([]);
});
