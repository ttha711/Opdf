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

async function goToPage(page: Page, number: number) {
  // The Pages button is hidden on desktop; navigate through the actual PDF scroller.
  const target = page.locator(".native-edit-page").nth(number - 1);
  await expect(target).toBeAttached({ timeout: 30_000 });
  await target.scrollIntoViewIfNeeded({ timeout: 30_000 });
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute(
    "data-opdf-page", String(number), { timeout: 30_000 },
  );
}

test("multi-page native edit remains responsive, saves and survives reload", async ({ page, request }) => {
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

  const heapSamples: number[] = [];
  for (const target of [45, 90, 2, 1]) {
    await goToPage(page, target);
    const probe = await page.evaluate(() => {
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      return { responsive: true, heap: memory?.usedJSHeapSize ?? null };
    });
    expect(probe.responsive).toBe(true);
    if (probe.heap !== null) heapSamples.push(probe.heap);
  }
  console.log(JSON.stringify({ documentFetches: fetches, heapMiB: heapSamples.map(x => Math.round(x / 1048576)) }));
  // All pages must not independently download the full document.
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
