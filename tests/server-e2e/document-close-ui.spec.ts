import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { openEmbedPdfSidebar } from "../helpers/embedpdf";

async function buildPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Close lifecycle regression", { x: 48, y: 220, size: 20, font });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

test("closing the document tears down the viewer and engine-owned sidebar", async ({ page, request }) => {
  const upload = await request.post("/api/opdf/documents?name=close-lifecycle.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: await buildPdf(),
  });
  expect(upload.status()).toBe(201);
  const document = await upload.json();

  await page.goto("/?open=" + encodeURIComponent(document.filePath));
  const viewer = page.locator("[data-opdf-engine='pdfium-wasm']");
  await expect(viewer).toBeVisible({ timeout: 30_000 });

  await openEmbedPdfSidebar(viewer);

  await page.locator("[data-opdf-menu-trigger='File']").click();
  await page.locator("[data-opdf-menu-item='Close']").click();

  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toHaveCount(0);
  await expect(page.locator("[data-opdf-native-editor='true']")).toHaveCount(0);
  await expect(page.locator("[data-opdf-right-sidebar='open']")).toHaveCount(0);
  await expect(page.locator(".opdf-side-panel--left")).toHaveCount(0);
  await expect(page.getByText("Open a PDF", { exact: false })).toBeVisible();
});
