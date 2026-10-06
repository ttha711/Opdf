import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

test.setTimeout(90_000);

async function buildPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Canvas native text", { x: 70, y: 180, size: 24, font });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

async function openCanvasEditor(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext) {
  const upload = await request.post("/api/opdf/documents?name=native-canvas.pdf", {
    headers: { "Content-Type": "application/pdf" },
    data: await buildPdf(),
  });
  expect(upload.status()).toBe(201);
  const document = await upload.json();

  await page.goto("/?open=" + encodeURIComponent(document.filePath));
  await expect(page.locator("[data-opdf-engine='pdfium-wasm']")).toBeVisible({ timeout: 30_000 });
  await page.getByTitle("Edit PDF Content").click();
  const expand = page.locator("[data-opdf-action='expand-right-panel']");
  await expect(expand).toBeVisible({ timeout: 20_000 });
  await expand.click();
  await expect(page.locator("[data-opdf-native-editor='true']")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-opdf-native-edit-page='1']")).toBeVisible({ timeout: 30_000 });
  return document;
}

test("canvas native editor selects, transforms and inline-edits PDF objects", async ({ page, request }) => {
  await openCanvasEditor(page, request);

  const editor = page.locator("[data-opdf-native-editor='true']");
  const textObject = page.locator("[data-opdf-canvas-object][data-opdf-object-kind='text']").first();
  await expect(textObject).toBeVisible({ timeout: 20_000 });

  await textObject.click();
  await expect(page.locator("[data-opdf-canvas-selection]")).toHaveCount(1);
  await expect(page.locator("[data-opdf-resize-handle]")).toHaveCount(8);
  await expect(page.locator("[data-opdf-rotate-handle='true']")).toHaveCount(1);
  await expect(editor.locator(".native-content-editor__objects button.active")).toContainText("Canvas native text");

  const selection = page.locator("[data-opdf-canvas-selection]");
  const before = await selection.boundingBox();
  expect(before).not.toBeNull();
  if (!before) throw new Error("Selection bounding box is unavailable.");

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.keyboard.down("Alt");
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 24, before.y + before.height / 2 - 12, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(editor.getByText("Object moved on page.")).toBeVisible({ timeout: 20_000 });

  const refreshedSelection = page.locator("[data-opdf-canvas-selection]");
  await expect(refreshedSelection).toHaveCount(1);
  await refreshedSelection.dblclick();
  const inlineEditor = page.locator("[data-opdf-inline-text-editor='true']");
  await expect(inlineEditor).toBeVisible({ timeout: 10_000 });
  await inlineEditor.fill("Chỉnh sửa tiếng Việt");
  await inlineEditor.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");

  await expect(editor.getByText("Inline text updated with Unicode fallback.")).toBeVisible({ timeout: 20_000 });
  await expect(inlineEditor).toHaveCount(0);

  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await expect(editor.getByText("Native content edit undone.")).toBeVisible({ timeout: 20_000 });
});

test("canvas selection stays synchronized with the right-side object list", async ({ page, request }) => {
  await openCanvasEditor(page, request);

  const editor = page.locator("[data-opdf-native-editor='true']");
  const objectButton = editor.locator("[data-opdf-object-kind='text']").first();
  await expect(objectButton).toBeVisible({ timeout: 20_000 });
  await objectButton.click();

  const id = await objectButton.getAttribute("data-opdf-object-id");
  expect(id).toBeTruthy();
  await expect(page.locator(`[data-opdf-canvas-selection="${id}"]`)).toBeVisible();

  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(editor.getByText("Object pasted.")).toBeVisible({ timeout: 20_000 });
  await expect(editor).toBeVisible();
  await expect(editor.locator("[data-opdf-object-kind='text']")).toHaveCount(2, { timeout: 20_000 });

  await page.locator("[data-opdf-native-edit-page='1']").click({ position: { x: 8, y: 8 } });
  await expect(page.locator("[data-opdf-canvas-selection]")).toHaveCount(0);
});
