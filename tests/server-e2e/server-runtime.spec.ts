import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { embedPdfSidebarPanel, openEmbedPdfSidebar } from "../helpers/embedpdf";
import { clickApplicationMenuItem } from "../helpers/app-menu";


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

  const manifest = await request.get("/asset-manifest.json");
  expect(manifest.ok()).toBeTruthy();
  expect(manifest.headers()["cache-control"]).toContain("no-cache");
  const manifestJson = await manifest.json() as Record<string, { file?: string }>;
  const hashedAsset = Object.values(manifestJson)
    .map((entry) => entry.file)
    .find((file): file is string => Boolean(file?.includes("/assets/") || file?.startsWith("assets/")));
  expect(hashedAsset).toBeTruthy();
  const asset = await request.get("/" + hashedAsset);
  expect(asset.ok()).toBeTruthy();
  expect(asset.headers()["cache-control"]).toContain("immutable");
});


test("production open URLs use the OPDF document API and never Vite /@fs", async ({ page, request }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  const upload = await request.post("/api/opdf/documents?name=api-open.pdf", {
    headers: { "content-type": "application/pdf" },
    data: Buffer.from(await pdf.save()),
  });
  expect(upload.ok()).toBeTruthy();
  const stored = await upload.json() as { id: string };

  const viteFsRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/@fs/")) viteFsRequests.push(request.url());
  });

  await page.goto(`/?open=${encodeURIComponent(`/api/opdf/documents/${stored.id}`)}`);
  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Page\s+1\s+of\s+1/i)).toBeVisible({ timeout: 30_000 });
  expect(viteFsRequests).toEqual([]);
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
  await clickApplicationMenuItem(page, "Search & Secure Redact...");
  const redactModal = page.locator(".premium-modal").filter({ hasText: "Search & Secure Redact" });
  await redactModal.getByPlaceholder("Text to redact…").fill("SERVER DRAWING SHEET 24");
  await redactModal.getByRole("button", { name: "Search all pages", exact: true }).click();
  await expect(redactModal).toContainText("1 match(es) found", { timeout: 30_000 });
  await expect(viewer).toHaveAttribute("data-opdf-source", "server");
  await redactModal.locator(".premium-modal-header").getByRole("button").click();

  // Opening Split/Merge should stay metadata-only. Large server PDFs are
  // materialized only when the user actually starts the operation.
  await clickApplicationMenuItem(page, "Split PDF...");
  const splitPanel = page.locator("aside.acrobat-tool-panel").filter({ hasText: "Advanced Split Document" });
  await expect(splitPanel).toBeVisible();
  await expect(viewer).toHaveAttribute("data-opdf-source", "server");
  await splitPanel.getByTitle("Close tool").click();

  await clickApplicationMenuItem(page, "Merge PDFs...");
  const mergePanel = page.locator("aside.acrobat-tool-panel").filter({ hasText: "Advanced Merge Documents" });
  await expect(mergePanel).toBeVisible();
  await expect(viewer).toHaveAttribute("data-opdf-source", "server");
  await mergePanel.getByTitle("Close tool").click();

  // Structural edits on stored server PDFs persist immediately without
  // materializing a browser working copy.
  const mutationResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/mutations") && response.request().method() === "POST",
  );
  await clickApplicationMenuItem(page, "Rotate All Pages Right");
  const mutationResponse = await mutationResponsePromise;
  expect(mutationResponse.ok()).toBeTruthy();
  await expect(viewer).toHaveAttribute("data-opdf-source", "server", { timeout: 30_000 });
  await expect(page.getByText(/Page\s+1\s+of\s+24/i)).toBeVisible({ timeout: 30_000 });
});


test("large persisted PDFs keep the full EmbedPDF toolbar and sidebar", async ({ page, request }) => {
  const pdf = await PDFDocument.create();
  const sheet = pdf.addPage([842, 595]);
  sheet.drawText("LARGE SERVER VIEWER SHELL", { x: 48, y: 520, size: 20 });
  const bytes = Buffer.from(await pdf.save());

  const upload = await request.post("/api/opdf/documents?name=large-viewer-shell.pdf", {
    headers: { "content-type": "application/pdf" },
    data: bytes,
  });
  expect(upload.ok()).toBeTruthy();
  const stored = await upload.json() as { filePath: string };

  await page.route("**/api/opdf/documents/**", async (route) => {
    if (route.request().method() !== "HEAD") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-length": String(40 * 1024 * 1024),
        "accept-ranges": "bytes",
      },
      body: "",
    });
  });

  await page.goto(`/?open=${encodeURIComponent(stored.filePath)}`);
  await expect(page.locator('[data-opdf-progressive-viewer="true"]')).toBeVisible({
    timeout: 30_000,
  });
  const viewer = page.locator('[data-opdf-engine="pdfium-wasm"]');
  await expect(viewer).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-opdf-engine="pdfjs-range"]')).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "View", exact: true })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Annotate", exact: true })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Shapes", exact: true })).toBeVisible();

  await expect(embedPdfSidebarPanel(viewer)).toBeVisible({ timeout: 15_000 });
  await openEmbedPdfSidebar(viewer);
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
