import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

test("OPDF Server serves the full web runtime", async ({ page, request }) => {
  const health = await request.get("/api/opdf/health");
  expect(health.ok()).toBeTruthy();
  await expect(health.json()).resolves.toMatchObject({
    ok: true,
    runtime: "server",
  });

  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();

  const runtime = await page.evaluate(() => ({
    mode: window.__OPDF_RUNTIME__,
    base: window.__OPDF_SERVER_BASE__,
    hasDesktopBridge: Boolean(window.opdf),
  }));

  expect(runtime).toEqual({
    mode: "server",
    base: "/api/opdf",
    hasDesktopBridge: false,
  });

  await expect(page.locator("body")).not.toContainText(
    "This feature is only available on Local or Desktop App versions.",
  );
});


test("OPDF Server opens a persisted PDF directly in the PDFium web viewer", async ({ page, request }) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 24; index += 1) {
    const sheet = pdf.addPage([1684, 1191]);
    sheet.drawText(`SERVER DRAWING SHEET ${index + 1}`, {
      x: 48,
      y: 1120,
      size: 20,
      font,
    });
  }

  const bytes = Buffer.from(await pdf.save());
  const upload = await request.post("/api/opdf/documents?name=server-drawing.pdf", {
    headers: { "content-type": "application/pdf" },
    data: bytes,
  });
  expect(upload.ok()).toBeTruthy();
  const stored = await upload.json() as { filePath: string };

  await page.goto(`/?open=${encodeURIComponent(stored.filePath)}`);
  const viewer = page.locator('[data-opdf-engine="pdfium-wasm"]');
  await expect(viewer).toBeVisible({ timeout: 30_000 });
  await expect(viewer).toHaveAttribute("data-opdf-source", "server");
  await expect(page.getByText(/Page\s+1\s+of\s+24/i)).toBeVisible({ timeout: 30_000 });

  // Read-only tools should consume the persisted server URL directly instead
  // of forcing a full working-copy materialization.
  await page.getByRole("button", { name: "Search & Secure Redact", exact: true }).click();
  const redactModal = page.locator(".premium-modal").filter({ hasText: "Search & Secure Redact" });
  await redactModal.getByPlaceholder("Text to redact…").fill("SERVER DRAWING SHEET 24");
  await redactModal.getByRole("button", { name: "Search all pages", exact: true }).click();
  await expect(redactModal).toContainText("1 match(es) found", { timeout: 30_000 });
  await expect(viewer).toHaveAttribute("data-opdf-source", "server");
  await redactModal.locator(".premium-modal-header").getByRole("button").click();

  // Opening Split/Merge should stay metadata-only. Large server PDFs are
  // materialized only when the user actually starts the operation.
  const header = page.locator("header");
  await header.getByRole("button", { name: "File", exact: true }).click();
  await header.getByRole("button", { name: "Split PDF", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Advanced Split Document");
  await expect(viewer).toHaveAttribute("data-opdf-source", "server");
  await page.getByRole("button", { name: "Close dialog" }).click();

  await header.getByRole("button", { name: "File", exact: true }).click();
  await header.getByRole("button", { name: "Merge PDFs", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Advanced Merge Documents");
  await expect(viewer).toHaveAttribute("data-opdf-source", "server");
  await page.getByRole("button", { name: "Close dialog" }).click();

  // Structural edits on stored server PDFs persist immediately without
  // materializing a browser working copy.
  await header.getByRole("button", { name: "View", exact: true }).click();
  await header.getByRole("button", { name: "Rotate All Pages Right", exact: true }).click();
  await expect(page.getByText("Saved to OPDF Server.", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(viewer).toHaveAttribute("data-opdf-source", "server", { timeout: 30_000 });
  await expect(page.getByText(/Page\s+1\s+of\s+24/i)).toBeVisible({ timeout: 30_000 });
});
