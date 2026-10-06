import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

test("web viewer boots to the document Home screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your documents, ready when you are." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open PDF", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "All tools", exact: true })).toBeVisible();
  await expect(page.getByText("Opdf Power Tools Dashboard")).toHaveCount(0);
});


test("desktop top bar keeps tabs and save status stable", async ({ page }) => {
  await page.goto("/");
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  const input = page.locator('input[type="file"][accept="application/pdf"]').first();
  await input.setInputFiles({
    name: "topbar-layout.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });

  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".opdf-topbar .tab-bar-container")).toBeVisible();

  const header = page.locator('[data-opdf-region="app-header"]');
  await expect(header.getByRole("button", { name: "Application menu", exact: true })).toBeVisible();
  await expect(header.getByRole("button", { name: "File", exact: true })).toHaveCount(0);
  await expect(header.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(header.getByRole("button", { name: "View", exact: true })).toHaveCount(0);
  await expect(header.getByRole("button", { name: "Tools", exact: true })).toHaveCount(0);

  const saveCluster = page.locator(".opdf-save-cluster");
  const saveStatus = page.locator(".opdf-save-status-slot");
  await expect(saveCluster).toBeVisible();
  await expect(saveStatus).toBeVisible();
  const clusterBox = await saveCluster.boundingBox();
  const statusBox = await saveStatus.boundingBox();
  expect(Math.round(clusterBox?.width ?? 0)).toBe(112);
  expect(Math.round(statusBox?.width ?? 0)).toBe(76);

  await expect(header.getByRole("button", { name: /Save now|Saving/ })).toBeVisible();
  await expect(header.getByRole("button", { name: "Undo (Ctrl+Z)" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Redo (Ctrl+Y)" })).toBeVisible();
});
