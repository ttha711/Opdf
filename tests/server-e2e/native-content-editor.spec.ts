import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

async function buildTextPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Original OPDF text", { x: 70, y: 180, size: 24, font });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

test("native Edit PDF changes existing text and survives save/reload", async ({ page, request }) => {
  const upload = await request.post("/api/opdf/documents?name=native-edit.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: await buildTextPdf(),
  });
  expect(upload.status()).toBe(201);
  const document = await upload.json();

  await page.goto("/?open=" + encodeURIComponent(document.filePath));
  await expect(page.locator("[data-opdf-engine=\'pdfium-wasm\']")).toBeVisible({ timeout: 30_000 });

  await page.getByTitle("Edit PDF Content").click();
  const editor = page.locator("[data-opdf-native-editor=\'true\']");
  await expect(editor).toBeVisible();
  await expect(editor.getByText("Original OPDF text", { exact: false })).toBeVisible({ timeout: 20_000 });

  await editor.getByText("Original OPDF text", { exact: false }).click();
  const textarea = editor.locator("textarea");
  await textarea.fill("Edited OPDF native text");
  await editor.getByRole("button", { name: "Apply text" }).click();
  await expect(editor.getByText("Native PDF text updated.")).toBeVisible({ timeout: 20_000 });

  await editor.getByRole("button", { name: "Undo" }).click();
  await expect(editor.getByText("Original OPDF text", { exact: false })).toBeVisible({ timeout: 20_000 });
  await editor.getByRole("button", { name: "Redo" }).click();
  await expect(editor.getByText("Edited OPDF native text", { exact: false })).toBeVisible({ timeout: 20_000 });

  await editor.getByRole("button", { name: "Duplicate" }).click();
  await expect(
    editor.locator(".native-content-editor__objects button").filter({ hasText: "Edited OPDF native text" }),
  ).toHaveCount(2, { timeout: 20_000 });

  await page.getByTitle("Save (Ctrl+S)").click();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator("[data-opdf-engine=\'pdfium-wasm\']")).toBeVisible({ timeout: 30_000 });

  await page.getByTitle("Edit PDF Content").click();
  const reopened = page.locator("[data-opdf-native-editor=\'true\']");
  await expect(
    reopened.locator(".native-content-editor__objects button").filter({ hasText: "Edited OPDF native text" }),
  ).toHaveCount(2, { timeout: 20_000 });
  await expect(reopened.getByText("Original OPDF text", { exact: false })).toHaveCount(0);
});
