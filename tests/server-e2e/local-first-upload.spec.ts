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
