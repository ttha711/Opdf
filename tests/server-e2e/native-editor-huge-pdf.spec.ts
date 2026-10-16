import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { openClickableCadText } from "./cad-text-hit-target";
import { saveServerDocumentAndWait } from "../helpers/save";

const stressPdfPath = process.env.TPDF_STRESS_PDF;
const requestedEditPage = process.env.TPDF_STRESS_EDIT_PAGE;
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
    await session.send("HeapProfiler.collectGarbage");
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
  const historyStorageWarnings: string[] = [];
  const editTimings: Array<{ stage: string; elapsedMs: number; sizeMiB?: number }> = [];
  let documentGets = 0;
  let previewUploads = 0;
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (message.text().startsWith("[tpdf:native-edit-history]")) historyStorageWarnings.push(message.text());
    if (message.text().startsWith("TPDF_NATIVE_EDIT_TIMING=")) {
      try { editTimings.push(JSON.parse(message.text().slice("TPDF_NATIVE_EDIT_TIMING=".length))); } catch {}
    }
    if (message.type() === "error" && message.text().includes("ERR_INSUFFICIENT_RESOURCES")) {
      failures.push(message.text());
    }
  });
  page.on("request", (requestEvent) => {
    if (requestEvent.method() === "GET" && /^\/api\/tpdf\/documents\/[0-9a-f-]{36}$/i.test(new URL(requestEvent.url()).pathname)) {
      documentGets += 1;
    }
    if (requestEvent.method() === "POST" && new URL(requestEvent.url()).pathname === "/api/tpdf/native-edit-previews") {
      previewUploads += 1;
    }
  });

  const openStartedAt = Date.now();
  await page.goto(`/?tpdf-perf=1&open=${encodeURIComponent(stored.filePath)}`);
  const fullPdfFallback = page.getByRole("button", { name: "Download and open full PDF" });
  const status = page.locator('[data-tpdf-region="status-bar"]');
  await expect.poll(async () =>
    Number(await status.getAttribute("data-tpdf-total-pages")) > 0 || fullPdfFallback.isVisible(),
  { timeout: 120_000 }).toBe(true);
  if (Number(await status.getAttribute("data-tpdf-total-pages")) <= 0) {
    await fullPdfFallback.click();
  }
  await expect(status).toHaveAttribute("data-tpdf-page", "1", { timeout: 120_000 });
  await expect.poll(async () => Number(await status.getAttribute("data-tpdf-total-pages")),
    { timeout: 30_000 }).toBeGreaterThan(0);
  const totalPages = Number(await status.getAttribute("data-tpdf-total-pages"));
  const editPage = requestedEditPage === "last" ? totalPages : Number(requestedEditPage || 1);
  expect(Number.isInteger(editPage) && editPage >= 1 && editPage <= totalPages).toBe(true);
  const firstPageMs = Date.now() - openStartedAt;
  const heapBefore = await page.evaluate(() =>
    (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
  );
  const memoryBefore = await browserMemory(page);

  const navigationMs: number[] = [];
  for (const target of [Math.max(1, Math.round(totalPages / 2)), totalPages, editPage]) {
    const startedAt = Date.now();
    await goToPage(page, target);
    navigationMs.push(Date.now() - startedAt);
  }
  const zoomBefore = await status.getAttribute("data-tpdf-zoom");
  const zoomStartedAt = Date.now();
  await page.keyboard.press("=");
  await expect(status).not.toHaveAttribute("data-tpdf-zoom", zoomBefore || "");
  const zoomMs = Date.now() - zoomStartedAt;

  const editStartedAt = Date.now();
  await page.getByTitle("Edit PDF Content").click();
  await page.locator('[data-tpdf-action="expand-right-panel"]').click();
  const editor = page.locator('[data-tpdf-native-editor="true"]');
  await expect(editor).toBeVisible({ timeout: 60_000 });
  const editReadyMs = Date.now() - editStartedAt;
  const memoryWithEditor = await browserMemory(page);

  const original = editor.locator(".native-content-editor__objects button[data-tpdf-object-kind]").first();
  await expect(original).toBeVisible({ timeout: 60_000 });
  if (fileInfo.size >= 100 * MiB) {
    await expect.poll(() => editor.page().locator('[data-tpdf-native-edit-remote-raster="true"] img')
      .evaluateAll((images) => images.length > 0 && images.every((image) =>
        (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)),
    { timeout: 60_000 }).toBe(true);
    expect(previewUploads).toBe(1);
  }
  const inspectReadyMs = Date.now() - editStartedAt;
  const objectId = await original.getAttribute("data-tpdf-object-id");
  const objectKind = await original.getAttribute("data-tpdf-object-kind");
  const originalBounds = await original.getAttribute("data-tpdf-bounds");
  expect(objectId).toBeTruthy();
  const targetObject = editor.locator(
    `.native-content-editor__objects button[data-tpdf-object-id="${objectId}"]`,
  );
  const originalText = objectKind === "text" ? await targetObject.innerText() : null;
  const directEditStartedAt = Date.now();
  const applyStartedAt = Date.now();
  let changedBounds: string | null = null;
  if (objectKind === "text") {
    await openClickableCadText(page, objectId!);
    const inlineEditor = page.getByRole("textbox", { name: "Edit PDF text" });
    await expect(inlineEditor).toBeVisible();
    await inlineEditor.fill("TPDF stress edit persisted");
    await inlineEditor.press("Enter");
    await expect(inlineEditor).toHaveCount(0);
    await expect(editor.getByText("Text applied. Check the Save status in the toolbar.")).toBeVisible();
    await expect(targetObject).toContainText("TPDF stress edit persisted");
  } else {
    await original.click();
    await editor.getByRole("button", { name: "Move right" }).click();
    await expect(editor.getByText("Object moved.")).toBeVisible();
    changedBounds = await targetObject.getAttribute("data-tpdf-bounds");
    expect(changedBounds).toBeTruthy();
    expect(changedBounds).not.toBe(originalBounds);
  }
  expect(historyStorageWarnings).toEqual([]);
  await expect(editor.getByText("Undo history is limited to one step for this large PDF.", { exact: false })).toBeVisible();
  const directEditMs = Date.now() - directEditStartedAt;
  const applyMs = Date.now() - applyStartedAt;

  await editor.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(editor.getByText("Native content edit undone.", { exact: false })).toBeVisible({ timeout: 20_000 });
  if (objectKind === "text") {
    await expect(targetObject).toContainText(originalText!);
    await expect(targetObject).not.toContainText("TPDF stress edit persisted");
  } else {
    await expect(targetObject).toHaveAttribute("data-tpdf-bounds", originalBounds || "");
  }
  await editor.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(editor.getByText("Native content edit redone.", { exact: false })).toBeVisible({ timeout: 20_000 });
  if (objectKind === "text") {
    await expect(targetObject).toContainText("TPDF stress edit persisted");
  } else {
    await expect(targetObject).toHaveAttribute("data-tpdf-bounds", changedBounds || "");
  }
  if (fileInfo.size >= 100 * MiB) {
    await expect.poll(() => previewUploads, { timeout: 20_000 }).toBe(2);
    await page.waitForTimeout(1_000);
    expect(previewUploads).toBe(2);
  }
  const memoryAfterUndoRedo = await browserMemory(page);
  if (memoryAfterUndoRedo) {
    expect(memoryAfterUndoRedo.usedMiB, "retained JS heap after large-PDF Undo/Redo").toBeLessThan(400);
  }

  const saveStartedAt = Date.now();
  await saveServerDocumentAndWait(page);
  const saveMs = Date.now() - saveStartedAt;
  const heapAfter = await page.evaluate(() =>
    (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
  );
  const memoryAfterSave = await browserMemory(page);

  const reloadStartedAt = Date.now();
  await page.reload();
  await expect(status).toHaveAttribute("data-tpdf-total-pages", String(totalPages), { timeout: 120_000 });
  if (Number(await status.getAttribute("data-tpdf-page")) !== editPage) await goToPage(page, editPage);
  await page.getByTitle("Edit PDF Content").click();
  await page.locator('[data-tpdf-action="expand-right-panel"]').click();
  const reloadedEditor = page.locator('[data-tpdf-native-editor="true"]');
  const reloadedObject = reloadedEditor.locator(
    `.native-content-editor__objects button[data-tpdf-object-id="${objectId}"]`,
  );
  await expect(reloadedObject).toBeVisible({ timeout: 60_000 });
  if (objectKind === "text") {
    await expect(reloadedObject).toContainText("TPDF stress edit persisted");
  } else {
    await expect(reloadedObject).not.toHaveAttribute("data-tpdf-bounds", originalBounds || "");
  }
  const reloadMs = Date.now() - reloadStartedAt;
  expect(documentGets).toBeLessThan(20);
  expect(failures).toEqual([]);

  console.log("LARGE_PDF_PERF_RESULT=" + JSON.stringify({
    sizeMiB: Math.round(fileInfo.size / MiB), editPage, uploadMs, firstPageMs, navigationMs, zoomMs, editReadyMs,
    inspectReadyMs, directEditMs, applyMs, saveMs, reloadMs, editTimings, documentGets, previewUploads,
    heapBeforeMiB: heapBefore == null ? null : Math.round(heapBefore / MiB),
    heapAfterSaveMiB: heapAfter == null ? null : Math.round(heapAfter / MiB),
    memoryBefore, memoryWithEditor, memoryAfterUndoRedo, memoryAfterSave,
    editedObjectPersistedAfterReload: true, failures,
  }));
});
