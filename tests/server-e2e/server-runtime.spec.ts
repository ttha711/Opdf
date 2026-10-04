import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

async function clickHeaderMenuItem(page: Page, menu: "File" | "View" | "Tools", item: string) {
  const header = page.locator("header");
  await header.getByRole("button", { name: menu, exact: true }).click();
  await header.getByRole("menuitem", { name: item, exact: true }).click();
}


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
  await clickHeaderMenuItem(page, "Tools", "Search & Secure Redact...");
  const redactModal = page.locator(".premium-modal").filter({ hasText: "Search & Secure Redact" });
  await redactModal.getByPlaceholder("Text to redact…").fill("SERVER DRAWING SHEET 24");
  await redactModal.getByRole("button", { name: "Search all pages", exact: true }).click();
  await expect(redactModal).toContainText("1 match(es) found", { timeout: 30_000 });
  await expect(viewer).toHaveAttribute("data-opdf-source", "server");
  await redactModal.locator(".premium-modal-header").getByRole("button").click();

  // Opening Split/Merge should stay metadata-only. Large server PDFs are
  // materialized only when the user actually starts the operation.
  await clickHeaderMenuItem(page, "Tools", "Split PDF...");
  const splitPanel = page.locator("aside.acrobat-tool-panel").filter({ hasText: "Advanced Split Document" });
  await expect(splitPanel).toBeVisible();
  await expect(viewer).toHaveAttribute("data-opdf-source", "server");
  await splitPanel.getByTitle("Close tool").click();

  await clickHeaderMenuItem(page, "Tools", "Merge PDFs...");
  const mergePanel = page.locator("aside.acrobat-tool-panel").filter({ hasText: "Advanced Merge Documents" });
  await expect(mergePanel).toBeVisible();
  await expect(viewer).toHaveAttribute("data-opdf-source", "server");
  await mergePanel.getByTitle("Close tool").click();

  // Structural edits on stored server PDFs persist immediately without
  // materializing a browser working copy.
  const mutationResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/mutations") && response.request().method() === "POST",
  );
  await clickHeaderMenuItem(page, "View", "Rotate All Pages Right");
  const mutationResponse = await mutationResponsePromise;
  expect(mutationResponse.ok()).toBeTruthy();
  await expect(viewer).toHaveAttribute("data-opdf-source", "server", { timeout: 30_000 });
  await expect(page.getByText(/Page\s+1\s+of\s+24/i)).toBeVisible({ timeout: 30_000 });
});


test("server persists page reorder mutations", async ({ request }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  pdf.addPage([400, 500]);
  pdf.addPage([500, 600]);
  const upload = await request.post("/api/opdf/documents?name=reorder-pages.pdf", {
    headers: { "content-type": "application/pdf" },
    data: Buffer.from(await pdf.save()),
  });
  expect(upload.ok()).toBeTruthy();
  const stored = await upload.json() as { id: string };

  const reorder = await request.post(`/api/opdf/documents/${stored.id}/mutations`, {
    headers: { "content-type": "application/json" },
    data: { type: "reorder-pages", pageOrder: [3, 1, 2] },
  });
  expect(reorder.ok()).toBeTruthy();

  const response = await request.get(`/api/opdf/documents/${stored.id}`);
  expect(response.ok()).toBeTruthy();
  const reordered = await PDFDocument.load(Buffer.from(await response.body()));

  expect(reordered.getPageCount()).toBe(3);
  expect(reordered.getPage(0).getSize()).toEqual({ width: 500, height: 600 });
  expect(reordered.getPage(1).getSize()).toEqual({ width: 300, height: 400 });
  expect(reordered.getPage(2).getSize()).toEqual({ width: 400, height: 500 });
});


test("server persists duplicate page mutations", async ({ request }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  pdf.addPage([400, 500]);
  pdf.addPage([500, 600]);
  const upload = await request.post("/api/opdf/documents?name=duplicate-pages.pdf", {
    headers: { "content-type": "application/pdf" },
    data: Buffer.from(await pdf.save()),
  });
  expect(upload.ok()).toBeTruthy();
  const stored = await upload.json() as { id: string };

  const duplicate = await request.post(`/api/opdf/documents/${stored.id}/mutations`, {
    headers: { "content-type": "application/json" },
    data: { type: "duplicate-pages", pageNumbers: [2] },
  });
  expect(duplicate.ok()).toBeTruthy();

  const response = await request.get(`/api/opdf/documents/${stored.id}`);
  expect(response.ok()).toBeTruthy();
  const result = await PDFDocument.load(Buffer.from(await response.body()));

  expect(result.getPageCount()).toBe(4);
  expect(result.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
  expect(result.getPage(1).getSize()).toEqual({ width: 400, height: 500 });
  expect(result.getPage(2).getSize()).toEqual({ width: 400, height: 500 });
  expect(result.getPage(3).getSize()).toEqual({ width: 500, height: 600 });
});
