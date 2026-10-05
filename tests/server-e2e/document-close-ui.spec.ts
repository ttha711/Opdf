import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

async function buildPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Close lifecycle regression", { x: 48, y: 220, size: 20, font });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

test("closing the document tears down viewer-scoped editor UI", async ({ page, request }) => {
  const upload = await request.post("/api/opdf/documents?name=close-lifecycle.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: await buildPdf(),
  });
  expect(upload.status()).toBe(201);
  const document = await upload.json();

  await page.goto("/?open=" + encodeURIComponent(document.filePath));
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });

  await page.getByTitle("Edit PDF Content").click();
  await expect(page.locator("[data-opdf-native-editor='true']")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-opdf-right-sidebar='open']")).toBeVisible();

  await page.locator("[data-opdf-menu-trigger='File']").click();
  await page.locator("[data-opdf-menu-item='Close']").click();

  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toHaveCount(0);
  await expect(page.locator("[data-opdf-native-editor='true']")).toHaveCount(0);
  await expect(page.locator("[data-opdf-right-sidebar='open']")).toHaveCount(0);
  await expect(page.locator(".opdf-side-panel--left")).toBeHidden();
  await expect(page.getByText("Open a PDF", { exact: false })).toBeVisible();
});


test("signature panel can be closed by toggling the OPDF Signature tool", async ({ page, request }) => {
  const upload = await request.post("/api/opdf/documents?name=signature-panel.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: await buildPdf(),
  });
  expect(upload.status()).toBe(201);
  const document = await upload.json();

  await page.goto("/?open=" + encodeURIComponent(document.filePath));
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });

  const signatureButton = page.getByTitle("Signature (S)");
  await signatureButton.click();
  await expect(page.getByText("Signatures", { exact: true })).toBeVisible({ timeout: 20_000 });

  await signatureButton.click();
  await expect(page.getByText("Signatures", { exact: true })).toBeHidden({ timeout: 20_000 });
});
