import { expect, test } from "@playwright/test";
import { saveServerDocumentAndWait } from "../helpers/save";
import { buildFormPdf, buildObjectPdf, buildRotatedTextPdf, buildTextPdf } from "./native-content-fixtures";

test.setTimeout(90_000);

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

  await saveServerDocumentAndWait(page);
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

  await saveServerDocumentAndWait(page);
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

  await saveServerDocumentAndWait(page);
  await page.reload();
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });
  await page.getByTitle("Edit PDF Content").click();

  const reopened = page.locator("[data-opdf-native-editor='true']");
  await expect(reopened.locator(".native-content-editor__objects button").filter({ hasText: "New text" })).toHaveCount(1, { timeout: 20_000 });
});


test("native Edit PDF deep-edits Form XObject text, path and image and persists it", async ({ page, request }) => {
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
  const form = editor.locator("[data-opdf-object-depth='0'][data-opdf-object-kind='form']").first();
  await expect(form).toBeVisible({ timeout: 20_000 });

  const nestedText = editor.locator("[data-opdf-object-depth='1'][data-opdf-object-kind='text']").filter({ hasText: "Form child text" }).first();
  const nestedPath = editor.locator("[data-opdf-object-depth='1'][data-opdf-object-kind='path']").first();
  const nestedImage = editor.locator("[data-opdf-object-depth='1'][data-opdf-object-kind='image']").first();
  await expect(nestedText).toBeVisible({ timeout: 20_000 });
  await expect(nestedPath).toBeVisible({ timeout: 20_000 });
  await expect(nestedImage).toBeVisible({ timeout: 20_000 });

  await nestedText.click();
  await expect(editor.getByText("Nested in p0-o0", { exact: false })).toBeVisible();
  await expect(editor.getByText("Persistent Form edit")).toBeVisible();
  await expect(editor.getByLabel("Font size")).toBeEnabled();
  await editor.locator("textarea").fill("Edited inside Form");
  await editor.getByRole("button", { name: "Apply text" }).click();
  await expect(editor.getByText("Native PDF text updated.")).toBeVisible({ timeout: 20_000 });
  const promotedText = editor.locator("[data-opdf-object-depth='0'][data-opdf-object-kind='text']").filter({ hasText: "Edited inside Form" }).first();
  await expect(promotedText).toBeVisible({ timeout: 20_000 });

  await nestedPath.click();
  await editor.getByLabel("Blend mode").selectOption("Multiply");
  await editor.getByRole("button", { name: "Apply blend mode" }).click();
  await expect(editor.getByText("Blend mode set to Multiply.")).toBeVisible({ timeout: 20_000 });
  await expect(editor.locator("[data-opdf-object-depth='0'][data-opdf-object-kind='path']").first()).toBeVisible({ timeout: 20_000 });

  const beforeImageBounds = await nestedImage.getAttribute("data-opdf-bounds");
  await nestedImage.click();
  await editor.getByRole("button", { name: "→" }).click();
  await expect(editor.getByText("Object moved.")).toBeVisible({ timeout: 20_000 });
  const movedImage = editor.locator("[data-opdf-object-depth='0'][data-opdf-object-kind='image']").first();
  await expect(movedImage).toBeVisible({ timeout: 20_000 });
  await expect(movedImage).not.toHaveAttribute("data-opdf-bounds", beforeImageBounds ?? "", { timeout: 20_000 });

  await saveServerDocumentAndWait(page);
  await page.reload();
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });
  await page.getByTitle("Edit PDF Content").click();

  const reopened = page.locator("[data-opdf-native-editor='true']");
  const editedText = reopened.locator("[data-opdf-object-depth='0'][data-opdf-object-kind='text']").filter({ hasText: "Edited inside Form" });
  await expect(editedText).toHaveCount(1, { timeout: 20_000 });
  await expect(reopened.getByText("Form child text", { exact: false })).toHaveCount(0);
  await expect(reopened.locator("[data-opdf-object-depth='0'][data-opdf-object-kind='path']")).toHaveCount(1);
  await expect(reopened.locator("[data-opdf-object-depth='0'][data-opdf-object-kind='image']")).toHaveCount(1);
  await expect(reopened.locator("[data-opdf-object-depth='1']")).toHaveCount(0);

  await editedText.click();
  await reopened.getByRole("button", { name: "Delete object" }).click();
  await expect(reopened.getByText("Object deleted.")).toBeVisible({ timeout: 20_000 });
  await saveServerDocumentAndWait(page);
  await page.reload();
  await page.getByTitle("Edit PDF Content").click();
  await expect(page.locator("[data-opdf-native-editor='true'] [data-opdf-object-kind='text']").filter({ hasText: "Edited inside Form" })).toHaveCount(0, { timeout: 20_000 });
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

  await saveServerDocumentAndWait(page);
  const saved = await request.get(`/api/opdf/documents/${document.id}`);
  expect(saved.status()).toBe(200);
  const bytes = Buffer.from(await saved.body()).toString("latin1");
  expect(bytes).toMatch(/\/BM\s*\/Multiply|\/BM\/Multiply/);
});
