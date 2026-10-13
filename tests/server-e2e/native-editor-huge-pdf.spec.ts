import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { openClickableCadText } from "./cad-text-hit-target";
import { saveServerDocumentAndWait } from "../helpers/save";

const stressPdfPath = process.env.TPDF_STRESS_PDF;
const MiB = 1024 * 1024;

// Generate the local fixture with:
// npm run perf:pdf -- --mb 250 --pages 300
// Run with TPDF_STRESS_PDF=.tpdf-cad-fixtures/tpdf-stress-250mb-300pages.pdf.
test.skip(!stressPdfPath, "Set TPDF_STRESS_PDF to a locally generated large PDF to run this stress test.");
test.setTimeout(300_000);

async function goToPage(page: Page, target: number) {
  const trigger = page.locator('[data-tpdf-action="toggle-page-filmstrip"]');
  await trigger.evaluate((element: HTMLElement) => element.click());
  const option = page.locator(`[data-tpdf-page-thumb="${target}"]`);
  await expect(option).toBeAttached({ timeout: 30_000 });
  await option.evaluate((element: HTMLElement) => element.click());
  await expect(page.locator('[data-tpdf-region="status-bar"]'))
    .toHaveAttribute("data-tpdf-page", String(target), { timeout: 30_000 });
}

async function browserMemory(page: Page) {
  try {
    const session = await page.context().newCDPSession(page);
    const usage = await session.send("Runtime.getHeapUsage");
    await session.detach();
    return {
      usedMiB: Math.round(usage.usedSize / MiB),
      backingStorageMiB: Math.round(usage.backingStorageSize / MiB),
      embedderMiB: Math.round(usage.embedderHeapUsedSize / MiB),
    };
  } catch {
    return null;
  }
}

test("large CAD PDF opens, navigates, edits text, saves, and reloads", async ({ page }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL || "http://127.0.0.1:8787");
  const fileInfo = await stat(stressPdfPath!);
  const uploadStartedAt = Date.now();
  const upload = await fetch(`${baseURL}/api/tpdf/documents?name=large-cad-stress.pdf`, {
    method: "POST",
    headers: { "content-type": "application/pdf", "content-length": String(fileInfo.size) },
    body: createReadStream(stressPdfPath!) as unknown as BodyInit,
    // Node's fetch requires duplex mode when the request body is streamed.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  expect(upload.status).toBe(201);
  const stored = await upload.json() as { filePath: string };
  const uploadMs = Date.now() - uploadStartedAt;

  const failures: string[] = [];
  let documentGets = 0;
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("ERR_INSUFFICIENT_RESOURCES")) {
      failures.push(message.text());
    }
  });
  page.on("request", (requestEvent) => {
    if (requestEvent.method() === "GET" && new URL(requestEvent.url()).pathname.startsWith("/api/tpdf/documents/")) {
      documentGets += 1;
    }
  });

  const openStartedAt = Date.now();
  await page.goto(`/?open=${encodeURIComponent(stored.filePath)}`);
  const status = page.locator('[data-tpdf-region="status-bar"]');
  await expect(status).toHaveAttribute("data-tpdf-page", "1", { timeout: 120_000 });
  await expect.poll(async () => Number(await status.getAttribute("data-tpdf-total-pages")),
    { timeout: 30_000 }).toBeGreaterThan(0);
  const totalPages = Number(await status.getAttribute("data-tpdf-total-pages"));
  const firstPageMs = Date.now() - openStartedAt;
  const heapBefore = await page.evaluate(() =>
    (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
  );
  const memoryBefore = await browserMemory(page);

  const navigationMs: number[] = [];
  for (const target of [Math.max(1, Math.round(totalPages / 2)), totalPages, 1]) {
    const startedAt = Date.now();
    await goToPage(page, target);
    navigationMs.push(Date.now() - startedAt);
  }
  const zoomBefore = await status.getAttribute("data-tpdf-zoom");
  const zoomStartedAt = Date.now();
  await page.keyboard.press("Control+=");
  await expect(status).not.toHaveAttribute("data-tpdf-zoom", zoomBefore || "");
  const zoomMs = Date.now() - zoomStartedAt;

  const editStartedAt = Date.now();
  await page.getByTitle("Edit PDF Content").click();
  await page.locator('[data-tpdf-action="expand-right-panel"]').click();
  const editor = page.locator('[data-tpdf-native-editor="true"]');
  await expect(editor).toBeVisible({ timeout: 60_000 });
  const editReadyMs = Date.now() - editStartedAt;
  const memoryWithEditor = await browserMemory(page);

  const original = editor.locator('.native-content-editor__objects [data-tpdf-object-kind="text"]').first();
  await expect(original).toBeVisible({ timeout: 60_000 });
  const objectId = await original.getAttribute("data-tpdf-object-id");
  expect(objectId).toBeTruthy();
  const originalText = (await original.innerText()).trim();
  const directEditStartedAt = Date.now();
  await openClickableCadText(page, objectId!);
  const inlineEditor = page.getByRole("textbox", { name: "Edit PDF text" });
  await expect(inlineEditor).toBeVisible();
  const directEditMs = Date.now() - directEditStartedAt;
  await inlineEditor.fill("TPDF stress edit persisted");
  await inlineEditor.press("Enter");
  await expect(inlineEditor).toHaveCount(0);
  await expect(editor.getByText("Text applied. Check the Save status in the toolbar.")).toBeVisible();

  const saveStartedAt = Date.now();
  await saveServerDocumentAndWait(page);
  const saveMs = Date.now() - saveStartedAt;
  const heapAfter = await page.evaluate(() =>
    (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
  );
  const memoryAfterSave = await browserMemory(page);

  await page.reload();
  await page.getByTitle("Edit PDF Content").click();
  await page.locator('[data-tpdf-action="expand-right-panel"]').click();
  const reloadedEditor = page.locator('[data-tpdf-native-editor="true"]');
  await expect(reloadedEditor.locator(".native-content-editor__objects").getByText("TPDF stress edit persisted"))
    .toBeVisible({ timeout: 60_000 });
  await expect(reloadedEditor.locator(".native-content-editor__objects").getByText(originalText)).toHaveCount(0);
  expect(documentGets).toBeLessThan(20);
  expect(failures).toEqual([]);

  console.log("LARGE_PDF_PERF_RESULT=" + JSON.stringify({
    sizeMiB: Math.round(fileInfo.size / MiB), uploadMs, firstPageMs, navigationMs, zoomMs, editReadyMs,
    directEditMs, saveMs, documentGets,
    heapBeforeMiB: heapBefore == null ? null : Math.round(heapBefore / MiB),
    heapAfterSaveMiB: heapAfter == null ? null : Math.round(heapAfter / MiB),
    memoryBefore, memoryWithEditor, memoryAfterSave,
    textPersistedAfterReload: true, failures,
  }));
});
