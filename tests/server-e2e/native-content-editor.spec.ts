import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

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

async function buildRotatedTextPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Rotated OPDF text", {
    x: 90,
    y: 120,
    size: 28,
    font,
    rotate: degrees(30),
  });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

function buildFormPdf() {
  const pageContent = "q\n1 0 0 1 100 100 cm\n/Fm0 Do\nQ";
  const formContent = "BT\n/F1 20 Tf\n20 40 Td\n(Form child text) Tj\nET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 300] /Resources << /XObject << /Fm0 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(pageContent, "ascii")} >>\nstream\n${pageContent}\nendstream`,
    `<< /Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 220 100] /Resources << /Font << /F1 6 0 R >> >> /Length ${Buffer.byteLength(formContent, "ascii")} >>\nstream\n${formContent}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let body = "%PDF-1.7\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets[index + 1] = Buffer.byteLength(body, "ascii");
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "ascii");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "ascii");
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


test("native Edit PDF deep-edits text inside a Form XObject and persists it", async ({ page, request }) => {
  const upload = await request.post("/api/opdf/documents?name=native-form.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: buildFormPdf(),
  });
  expect(upload.status()).toBe(201);
  const document = await upload.json();

  await page.goto("/?open=" + encodeURIComponent(document.filePath));
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });
  await page.getByTitle("Edit PDF Content").click();

  const editor = page.locator("[data-opdf-native-editor='true']");
  const form = editor.locator("[data-opdf-object-depth='0']").filter({ hasText: "FORM" }).first();
  await expect(form).toBeVisible({ timeout: 20_000 });
  const nestedText = editor.locator("[data-opdf-object-depth='1']").filter({ hasText: "Form child text" }).first();
  await expect(nestedText).toBeVisible({ timeout: 20_000 });
  await nestedText.click();

  await expect(editor.getByText("Nested in p0-o0", { exact: false })).toBeVisible();
  await expect(editor.getByLabel("Font size")).toBeDisabled();
  await editor.locator("textarea").fill("Edited inside Form");
  await editor.getByRole("button", { name: "Apply text" }).click();
  await expect(editor.getByText("Native PDF text updated.")).toBeVisible({ timeout: 20_000 });

  await page.getByTitle("Save (Ctrl+S)").click();
  await page.reload();
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });
  await page.getByTitle("Edit PDF Content").click();

  const reopened = page.locator("[data-opdf-native-editor='true']");
  await expect(reopened.locator("[data-opdf-object-depth='1']").filter({ hasText: "Edited inside Form" })).toHaveCount(1, { timeout: 20_000 });
  await expect(reopened.getByText("Form child text", { exact: false })).toHaveCount(0);
});

test("native Edit PDF exposes PDFium rotated bounds for precise selection", async ({ page, request }) => {
  const upload = await request.post("/api/opdf/documents?name=native-rotated.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: await buildRotatedTextPdf(),
  });
  expect(upload.status()).toBe(201);
  const document = await upload.json();

  await page.goto("/?open=" + encodeURIComponent(document.filePath));
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });
  await page.getByTitle("Edit PDF Content").click();

  const editor = page.locator("[data-opdf-native-editor='true']");
  const rotated = editor.locator("[data-opdf-rotated-bounds='true']").filter({ hasText: "Rotated OPDF text" }).first();
  await expect(rotated).toBeVisible({ timeout: 20_000 });
  await rotated.click();
  await expect(editor.locator("[data-opdf-rotated-selection='true']")).toBeVisible();
});

test("native Edit PDF writes PDFium blend mode into saved PDF", async ({ page, request }) => {
  const upload = await request.post("/api/opdf/documents?name=native-blend.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: await buildTextPdf(),
  });
  expect(upload.status()).toBe(201);
  const document = await upload.json();

  await page.goto("/?open=" + encodeURIComponent(document.filePath));
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });
  await page.getByTitle("Edit PDF Content").click();

  const editor = page.locator("[data-opdf-native-editor='true']");
  await editor.locator(".native-content-editor__objects button").filter({ hasText: "Original OPDF text" }).first().click();
  await editor.getByLabel("Blend mode").selectOption("Multiply");
  await editor.getByRole("button", { name: "Apply blend mode" }).click();
  await expect(editor.getByText("Blend mode set to Multiply.")).toBeVisible({ timeout: 20_000 });

  await page.getByTitle("Save (Ctrl+S)").click();
  const saved = await request.get(`/api/opdf/documents/${document.id}`);
  expect(saved.status()).toBe(200);
  const bytes = Buffer.from(await saved.body()).toString("latin1");
  expect(bytes).toMatch(/\/BM\s*\/Multiply|\/BM\/Multiply/);
});
