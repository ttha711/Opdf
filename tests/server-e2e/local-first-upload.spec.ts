import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

test("server runtime renders local PDF before background upload completes", async ({ page, request }) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 2; index += 1) {
    const sheet = pdf.addPage([1684, 1191]);
    sheet.drawText(`LOCAL FIRST SHEET ${index + 1}`, {
      x: 60,
      y: 1100,
      size: 24,
      font,
    });
  }
  const bytes = Buffer.from(await pdf.save());

  let releaseChunk!: () => void;
  const chunkGate = new Promise<void>((resolve) => {
    releaseChunk = resolve;
  });
  let chunkStarted = false;
  await page.route("**/api/opdf/uploads/*/chunks/*", async (route) => {
    chunkStarted = true;
    await chunkGate;
    await route.continue();
  });

  await page.goto("/");
  const fileInput = page.locator('input[type="file"][accept="application/pdf"]');
  await fileInput.setInputFiles({
    name: "local-first-a0.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });

  const viewer = page.locator('[data-opdf-engine="pdfium-wasm"]');
  await expect(viewer).toBeVisible({ timeout: 10_000 });
  await expect(viewer).toHaveAttribute("data-opdf-source", "working-copy");
  await expect(page.getByText(/Page\s+1\s+of\s+2/i)).toBeVisible({ timeout: 10_000 });

  const uploadBanner = page.locator('[data-opdf-upload-state="uploading"]');
  await expect(uploadBanner).toBeVisible();
  await expect(uploadBanner).toContainText("Opening locally");
  await expect.poll(() => chunkStarted).toBeTruthy();

  const beforeComplete = await request.get("/api/opdf/recent");
  const pendingRecents = await beforeComplete.json() as Array<{ filePath: string }>;
  expect(pendingRecents.some((item) => item.filePath.includes("local-first-a0.pdf"))).toBeFalsy();

  releaseChunk();
  await expect(page.locator('[data-opdf-upload-state="stored"]')).toBeVisible({ timeout: 20_000 });

  const afterComplete = await request.get("/api/opdf/recent");
  const storedRecents = await afterComplete.json() as Array<{ filePath: string }>;
  expect(storedRecents.some((item) => decodeURIComponent(item.filePath).includes("local-first-a0.pdf"))).toBeTruthy();
});


test("failed background upload keeps the PDF open and resumes from Retry", async ({ page, request }) => {
  const pdf = await PDFDocument.create();
  const sheet = pdf.addPage([1684, 1191]);
  sheet.drawText("RETRY LOCAL FIRST", { x: 60, y: 1100, size: 24 });
  const bytes = Buffer.from(await pdf.save());

  let chunkAttempts = 0;
  await page.route("**/api/opdf/uploads/*/chunks/*", async (route) => {
    chunkAttempts += 1;
    if (chunkAttempts <= 3) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "simulated transient upload failure" }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await page.locator('input[type="file"][accept="application/pdf"]').setInputFiles({
    name: "retry-local-first.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });

  const viewer = page.locator('[data-opdf-engine="pdfium-wasm"]');
  await expect(viewer).toBeVisible({ timeout: 10_000 });
  await expect(viewer).toHaveAttribute("data-opdf-source", "working-copy");

  const failedBanner = page.locator('[data-opdf-upload-state="failed"]');
  await expect(failedBanner).toBeVisible({ timeout: 15_000 });
  await expect(failedBanner).toContainText("PDF is still open locally");
  expect(chunkAttempts).toBe(3);

  await failedBanner.getByRole("button", { name: "Retry upload" }).click();
  await expect(page.locator('[data-opdf-upload-state="stored"]')).toBeVisible({ timeout: 20_000 });
  expect(chunkAttempts).toBeGreaterThan(3);

  const recents = await request.get("/api/opdf/recent");
  const rows = await recents.json() as Array<{ filePath: string }>;
  expect(rows.some((item) => decodeURIComponent(item.filePath).includes("retry-local-first.pdf"))).toBeTruthy();
});
