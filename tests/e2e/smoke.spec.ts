import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { clickApplicationMenuPath, openApplicationMenu } from "../helpers/app-menu";

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

  const appMenu = await openApplicationMenu(page);
  for (const label of ["Document", "Edit", "View", "Tools", "AI Edit"]) {
    await expect(appMenu.locator(`[data-opdf-menu-item="${label}"]:visible`).first()).toBeVisible();
  }
  for (const duplicate of ["Open...", "Close", "Export PDF..."]) {
    await expect(appMenu.locator(`[data-opdf-menu-item="${duplicate}"]:visible`)).toHaveCount(0);
  }
});


test("native PDF text editing is inline and advanced settings are opt-in", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pdfPage = pdf.addPage([612, 792]);
  pdfPage.drawText("EDIT THIS TEXT", { x: 72, y: 700, size: 24, font });

  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name: "inline-edit.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });

  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 20_000 });
  await clickApplicationMenuPath(page, ["Tools", "Edit & Review", "Edit PDF Content"]);

  await expect(page.locator('[data-opdf-native-edit-page="1"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-opdf-right-sidebar="closed"]')).toHaveCount(1);
  await expect(page.locator('[data-opdf-action="expand-right-panel"]')).toBeVisible();

  const textObject = page.locator('[data-opdf-canvas-object][data-opdf-object-kind="text"]').first();
  await expect(textObject).toBeVisible({ timeout: 20_000 });
  await textObject.click();

  const inlineEditor = page.locator('[data-opdf-inline-text-editor="true"]');
  await expect(inlineEditor).toBeVisible();
  await expect(inlineEditor).toHaveAttribute("aria-label", "Edit PDF text");
  await inlineEditor.fill("UPDATED INLINE TEXT");
  await inlineEditor.press("Enter");
  await expect(inlineEditor).toHaveCount(0, { timeout: 20_000 });

  await page.locator('[data-opdf-action="expand-right-panel"]').click();
  await expect(page.locator('[data-opdf-right-sidebar="open"]')).toBeVisible();
  await expect(page.locator('[data-opdf-native-editor="true"]')).toBeVisible();
  await expect(page.locator('[data-opdf-action="collapse-right-panel"]')).toBeVisible();
});

test("entering and leaving Edit PDF preserves the original reader instance", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name: "preserve-reader.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });

  const reader = page.locator('[data-opdf-engine="pdfium-wasm"]').first();
  await expect(reader).toBeVisible({ timeout: 20_000 });
  await reader.evaluate((node) => node.setAttribute("data-reader-stability-probe", "original"));
  await page.locator('[data-opdf-action="edit-content"]').click();
  await expect(page.locator('[data-opdf-native-edit-page="1"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-reader-stability-probe="original"]')).toBeAttached();

  const expand = page.locator('[data-opdf-action="expand-right-panel"]');
  if (await expand.isVisible()) await expand.click();
  await page.getByRole("button", { name: "Close Edit PDF" }).click();
  await expect(page.locator('[data-reader-stability-probe="original"]')).toBeVisible({ timeout: 20_000 });
});

test("double-clicking selectable PDF text enters editing without Edit PDF", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const first = pdf.addPage([612, 792]);
  first.drawText("DIRECT EDIT TARGET", { x: 72, y: 700, size: 24, font });
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name: "direct-edit-target.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 20_000 });
  const text = page.getByText("DIRECT EDIT TARGET", { exact: true }).first();
  await expect(text).toBeVisible({ timeout: 20_000 });
  await text.dblclick();
  await expect(page.locator('[data-opdf-native-edit-page="1"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-opdf-canvas-object][data-opdf-object-kind="text"]').first()).toBeVisible();
});
