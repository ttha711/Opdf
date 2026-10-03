import { readFile } from "node:fs/promises";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function createPdf(pageCount: number, prefix: string, revision = false) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index += 1) {
    const sheet = pdf.addPage([842, 595]);
    sheet.drawText(`${prefix} SHEET ${index + 1}`, {
      x: 48,
      y: 535,
      size: 20,
      font,
    });
    sheet.drawText("OPDF WEB SERVER REGRESSION", {
      x: 48,
      y: 500,
      size: 12,
      font,
    });
    if (revision && index === 0) {
      sheet.drawRectangle({
        x: 260,
        y: 210,
        width: 260,
        height: 140,
        color: rgb(0.05, 0.05, 0.05),
      });
      sheet.drawText("REVISION B", {
        x: 310,
        y: 275,
        size: 28,
        font,
        color: rgb(1, 1, 1),
      });
    }
  }
  return Buffer.from(await pdf.save());
}

async function uploadPdf(request: APIRequestContext, name: string, bytes: Buffer) {
  const upload = await request.post(`/api/opdf/documents?name=${encodeURIComponent(name)}`, {
    headers: { "content-type": "application/pdf" },
    data: bytes,
  });
  expect(upload.ok()).toBeTruthy();
  return upload.json() as Promise<{ id: string; filePath: string; fileName: string }>;
}

async function openStored(page: Page, filePath: string, pages: number) {
  await page.goto(`/?open=${encodeURIComponent(filePath)}`);
  const viewer = page.locator('[data-opdf-engine="pdfium-wasm"]');
  await expect(viewer).toBeVisible({ timeout: 30_000 });
  await expect(viewer).toHaveAttribute("data-opdf-source", "server");
  await expect(page.getByText(new RegExp(`Page\\s+1\\s+of\\s+${pages}`, "i"))).toBeVisible({ timeout: 30_000 });
  return viewer;
}

test("server structural edits and secure redaction survive Save + reload", async ({ page, request }) => {
  test.setTimeout(150_000);
  const stored = await uploadPdf(request, "persist-workflow.pdf", await createPdf(6, "PERSIST"));
  const viewer = await openStored(page, stored.filePath, 6);
  const header = page.locator("header");

  await header.getByRole("button", { name: "View", exact: true }).click();
  await header.getByRole("button", { name: "Rotate All Pages Right", exact: true }).click();
  await expect(page.getByText("Saved to OPDF Server.", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(viewer).toHaveAttribute("data-opdf-source", "server", { timeout: 30_000 });

  const persistedRotation = await request.get(`/api/opdf/documents/${stored.id}`);
  expect(persistedRotation.ok()).toBeTruthy();
  const rotatedDoc = await PDFDocument.load(Buffer.from(await persistedRotation.body()));
  expect(rotatedDoc.getPage(0).getRotation().angle).toBe(90);

  await openStored(page, stored.filePath, 6);

  await page.getByRole("button", { name: "Search & Secure Redact", exact: true }).click();
  let redactModal = page.locator(".premium-modal").filter({ hasText: "Search & Secure Redact" });
  await redactModal.getByPlaceholder("Text to redact…").fill("PERSIST SHEET 6");
  await redactModal.getByRole("button", { name: "Search all pages", exact: true }).click();
  await expect(redactModal).toContainText("1 match(es) found", { timeout: 30_000 });
  await redactModal.getByRole("button", { name: /Apply 1 secure redaction/i }).click();
  await expect(viewer).toHaveAttribute("data-opdf-source", "working-copy", { timeout: 30_000 });

  await page.getByRole("button", { name: "Save (Ctrl+S)", exact: true }).click();
  await expect(page.getByText("Saved to OPDF Server.", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

  await openStored(page, stored.filePath, 6);
  await page.getByRole("button", { name: "Search & Secure Redact", exact: true }).click();
  redactModal = page.locator(".premium-modal").filter({ hasText: "Search & Secure Redact" });
  await redactModal.getByPlaceholder("Text to redact…").fill("PERSIST SHEET 6");
  await redactModal.getByRole("button", { name: "Search all pages", exact: true }).click();
  await expect(redactModal).toContainText("0 match(es) found", { timeout: 30_000 });

  await expect(page.getByRole("button", { name: /Digital Sign/ })).toBeDisabled();
});

test("server compare, split and merge workflows execute end to end", async ({ page, request }) => {
  test.setTimeout(150_000);
  const base = await createPdf(3, "BASE");
  const stored = await uploadPdf(request, "tool-workflow.pdf", base);
  const viewer = await openStored(page, stored.filePath, 3);

  await page.getByRole("button", { name: "Compare revisions", exact: true }).click();
  const compare = page.locator("div.fixed.inset-0").filter({ hasText: "Compare revisions V2" });
  const revision = await createPdf(3, "BASE", true);
  await compare.locator('input[type="file"]').setInputFiles({
    name: "revision-b.pdf",
    mimeType: "application/pdf",
    buffer: revision,
  });
  await compare.getByRole("button", { name: "Detect changes", exact: true }).click();
  await expect(compare.getByText(/Changes \(\d+\)/)).toBeVisible({ timeout: 30_000 });
  await compare.getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-opdf-source", "server");

  const header = page.locator("header");
  await header.getByRole("button", { name: "File", exact: true }).click();
  await header.getByRole("button", { name: "Split PDF", exact: true }).click();
  const splitDialog = page.getByRole("dialog").filter({ hasText: "Advanced Split Document" });
  await splitDialog.getByText("Page Combination", { exact: true }).click();
  await splitDialog.locator("#extractInput").fill("1, 2");
  const splitDownloadPromise = page.waitForEvent("download");
  await splitDialog.getByRole("button", { name: "Split & Download", exact: true }).click();
  const splitDownload = await splitDownloadPromise;
  const splitPath = await splitDownload.path();
  expect(splitPath).toBeTruthy();
  const splitDoc = await PDFDocument.load(await readFile(splitPath!));
  expect(splitDoc.getPageCount()).toBe(2);

  await header.getByRole("button", { name: "File", exact: true }).click();
  await header.getByRole("button", { name: "Merge PDFs", exact: true }).click();
  const mergeDialog = page.getByRole("dialog").filter({ hasText: "Advanced Merge Documents" });
  const extra = await createPdf(1, "EXTRA");
  await mergeDialog.locator('input[type="file"]').setInputFiles({
    name: "extra.pdf",
    mimeType: "application/pdf",
    buffer: extra,
  });
  await expect(mergeDialog.getByText("Total Compiled Pages: 4", { exact: true })).toBeVisible();
  await mergeDialog.getByRole("button", { name: "Merge & Load Viewer", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-opdf-source", "working-copy", { timeout: 30_000 });
  await expect(page.getByText(/Page\s+1\s+of\s+4/i)).toBeVisible({ timeout: 30_000 });
});

test("server review annotations persist and browser export paths stay usable", async ({ page, request }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
  });
  const stored = await uploadPdf(request, "review-export.pdf", await createPdf(2, "REVIEW"));
  const now = Date.now();
  const annotations = [{
    id: "review-note-1",
    page: 1,
    kind: "note",
    payload: { text: "SERVER REVIEW NOTE" },
    createdAt: now,
    updatedAt: now,
  }];
  const put = await request.put(`/api/opdf/documents/${stored.id}/annotations`, {
    headers: { "content-type": "application/json" },
    data: { annotations },
  });
  expect(put.ok()).toBeTruthy();

  await openStored(page, stored.filePath, 2);
  await expect(page.getByText("SERVER REVIEW NOTE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(page.getByText("RESOLVED", { exact: true })).toBeVisible();

  await expect.poll(async () => {
    const savedAnnotations = await request.get(`/api/opdf/documents/${stored.id}/annotations`);
    if (!savedAnnotations.ok()) return false;
    const rows = await savedAnnotations.json() as Array<{ payload?: Record<string, unknown> }>;
    return rows[0]?.payload?.reviewResolved === true;
  }).toBe(true);

  const header = page.locator("header");
  await header.getByRole("button", { name: "File", exact: true }).click();
  const exportDownloadPromise = page.waitForEvent("download");
  await header.getByRole("button", { name: "Export PDF...", exact: true }).click();
  const exportDownload = await exportDownloadPromise;
  expect(exportDownload.suggestedFilename()).toMatch(/^exported-.*\.pdf$/i);
  const exportPath = await exportDownload.path();
  expect(exportPath).toBeTruthy();
  const exported = await PDFDocument.load(await readFile(exportPath!));
  expect(exported.getPageCount()).toBe(2);

  const imageDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "To Images", exact: true }).click();
  const imageDownload = await imageDownloadPromise;
  expect(imageDownload.suggestedFilename()).toMatch(/-images\.zip$/i);
});
