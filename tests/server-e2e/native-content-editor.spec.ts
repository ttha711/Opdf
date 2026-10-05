import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

test.setTimeout(90_000);

async function buildTextPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Original OPDF text", { x: 70, y: 180, size: 24, font });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}


async function buildObjectPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  page.drawRectangle({
    x: 50,
    y: 80,
    width: 120,
    height: 70,
    color: rgb(0.2, 0.6, 0.9),
    borderColor: rgb(0.1, 0.2, 0.3),
    borderWidth: 2,
  });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl8sAAAAASUVORK5CYII=",
    "base64",
  );
  const image = await doc.embedPng(png);
  page.drawImage(image, { x: 230, y: 90, width: 90, height: 90 });
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
  const originalObject = editor.locator(".native-content-editor__objects button").filter({ hasText: "Original OPDF text" }).first();
  await expect(originalObject).toBeVisible({ timeout: 20_000 });

  await originalObject.click();
  const textarea = editor.locator("textarea");
  await textarea.fill("Edited OPDF native text");
  await editor.getByRole("button", { name: "Apply text" }).click();
  await expect(editor.getByText("Native PDF text updated.")).toBeVisible({ timeout: 20_000 });

  await editor.getByRole("button", { name: "Undo" }).click();
  await expect(editor.locator(".native-content-editor__objects button").filter({ hasText: "Original OPDF text" }).first()).toBeVisible({ timeout: 20_000 });
  await editor.getByRole("button", { name: "Redo" }).click();
  await expect(editor.locator(".native-content-editor__objects button").filter({ hasText: "Edited OPDF native text" }).first()).toBeVisible({ timeout: 20_000 });

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


test("native Edit PDF edits vector geometry and crops/duplicates images", async ({ page, request }) => {
  const upload = await request.post("/api/opdf/documents?name=native-objects.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: await buildObjectPdf(),
  });
  expect(upload.status()).toBe(201);
  const document = await upload.json();

  await page.goto("/?open=" + encodeURIComponent(document.filePath));
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });
  await page.getByTitle("Edit PDF Content").click();

  const editor = page.locator("[data-opdf-native-editor='true']");
  await expect(editor).toBeVisible();
  const objectButtons = editor.locator(".native-content-editor__objects button");
  await expect(objectButtons.filter({ hasText: "PATH" }).first()).toBeVisible({ timeout: 20_000 });
  await expect(objectButtons.filter({ hasText: "IMAGE" }).first()).toBeVisible({ timeout: 20_000 });

  await objectButtons.filter({ hasText: "PATH" }).first().click();
  const pathEditor = editor.locator(".native-content-editor__path-editor");
  await expect(pathEditor).toBeVisible();
  const firstCoordinate = pathEditor.locator('input[inputmode="decimal"]').first();
  await firstCoordinate.fill("55");
  await pathEditor.getByRole("button", { name: "Apply geometry" }).click();
  await expect(editor.getByText("Path geometry updated.")).toBeVisible({ timeout: 20_000 });

  await editor.getByRole("button", { name: "Duplicate" }).click();
  await expect(objectButtons.filter({ hasText: "PATH" })).toHaveCount(2, { timeout: 20_000 });

  await objectButtons.filter({ hasText: "IMAGE" }).first().click();
  await editor.getByRole("button", { name: "Left" }).click();
  await expect(editor.getByText("Image cropped from left.")).toBeVisible({ timeout: 20_000 });
  await editor.getByRole("button", { name: "Duplicate" }).click();
  await expect(objectButtons.filter({ hasText: "IMAGE" })).toHaveCount(2, { timeout: 20_000 });

  await page.getByTitle("Save (Ctrl+S)").click();
  await page.reload();
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });
  await page.getByTitle("Edit PDF Content").click();

  const reopened = page.locator("[data-opdf-native-editor='true']");
  await expect(reopened.locator(".native-content-editor__objects button").filter({ hasText: "PATH" })).toHaveCount(2, { timeout: 20_000 });
  await expect(reopened.locator(".native-content-editor__objects button").filter({ hasText: "IMAGE" })).toHaveCount(2, { timeout: 20_000 });
});


test("native Edit PDF can add a new PDFium text object and persist it", async ({ page, request }) => {
  const upload = await request.post("/api/opdf/documents?name=native-add-text.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: await buildTextPdf(),
  });
  expect(upload.status()).toBe(201);
  const document = await upload.json();

  await page.goto("/?open=" + encodeURIComponent(document.filePath));
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });
  await page.getByTitle("Edit PDF Content").click();

  const editor = page.locator("[data-opdf-native-editor='true']");
  await editor.getByRole("button", { name: "+ Text" }).click();
  await expect(editor.getByText("Native text object added.")).toBeVisible({ timeout: 20_000 });
  await expect(editor.locator(".native-content-editor__objects button").filter({ hasText: "New text" })).toHaveCount(1, { timeout: 20_000 });

  await page.getByTitle("Save (Ctrl+S)").click();
  await page.reload();
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });
  await page.getByTitle("Edit PDF Content").click();

  const reopened = page.locator("[data-opdf-native-editor='true']");
  await expect(reopened.locator(".native-content-editor__objects button").filter({ hasText: "New text" })).toHaveCount(1, { timeout: 20_000 });
});
