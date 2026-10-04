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
