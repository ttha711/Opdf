import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

test.setTimeout(90_000);

function parseBounds(value: string | null) {
  const [x = 0, y = 0, width = 0, height = 0] = (value ?? "").split(",").map(Number);
  return { x, y, width, height };
}

async function buildPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Canvas native text", { x: 70, y: 180, size: 24, font });
  page.drawText("Second native text", { x: 70, y: 115, size: 20, font });
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

  const before = await textObject.boundingBox();
  expect(before).not.toBeNull();
  if (!before) throw new Error("Text object bounding box is unavailable.");

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 24, before.y + before.height / 2 - 12, { steps: 4 });
  await page.mouse.up();
  const optimistic = await page.locator("[data-opdf-canvas-selection]").boundingBox();
  expect(optimistic).not.toBeNull();
  expect((optimistic?.x ?? 0)).toBeGreaterThan(before.x);
  await expect(editor.getByText("Object moved on page.")).toBeVisible({ timeout: 20_000 });

  const refreshedSelection = page.locator("[data-opdf-canvas-selection]");
  await expect(refreshedSelection).toHaveCount(1);
  await expect(page.locator("[data-opdf-resize-handle]")).toHaveCount(8);
  await expect(page.locator("[data-opdf-rotate-handle='true']")).toHaveCount(1);
  await expect(editor.locator(".native-content-editor__objects button.active")).toContainText("Canvas native text");
  await refreshedSelection.click();
  const inlineEditor = page.locator("[data-opdf-inline-text-editor='true']");
  await expect(inlineEditor).toBeVisible({ timeout: 10_000 });
  await inlineEditor.fill("Chỉnh sửa tiếng Việt");
  await inlineEditor.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");

  await expect(editor.getByText("Inline text updated with Unicode fallback.")).toBeVisible({ timeout: 20_000 });
  await expect(inlineEditor).toHaveCount(0);

  const beforeKeyboard = await page.locator("[data-opdf-canvas-selection]").boundingBox();
  expect(beforeKeyboard).not.toBeNull();
  await page.keyboard.press("ArrowRight");
  await expect(editor.getByText("Object moved with keyboard.")).toBeVisible({ timeout: 20_000 });
  const afterKeyboard = await page.locator("[data-opdf-canvas-selection]").boundingBox();
  expect(afterKeyboard).not.toBeNull();
  expect((afterKeyboard?.x ?? 0)).toBeGreaterThan(beforeKeyboard?.x ?? 0);

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
  await expect(editor.locator("[data-opdf-object-kind='text']")).toHaveCount(3, { timeout: 20_000 });

  await page.locator("[data-opdf-native-edit-page='1']").click({ position: { x: 8, y: 8 } });
  await expect(page.locator("[data-opdf-canvas-selection]")).toHaveCount(0);
});


test("inline edit commits before deselect/selection change and Escape cancels", async ({ page, request }) => {
  await openCanvasEditor(page, request);

  const editor = page.locator("[data-opdf-native-editor='true']");
  const objects = page.locator("[data-opdf-canvas-object][data-opdf-object-kind='text']");
  await expect(objects).toHaveCount(2, { timeout: 20_000 });

  await objects.first().dblclick();
  const inlineEditor = page.locator("[data-opdf-inline-text-editor='true']");
  await expect(inlineEditor).toBeVisible();
  await inlineEditor.fill("Committed by click outside");
  await page.locator("[data-opdf-native-edit-page='1']").click({ position: { x: 8, y: 8 } });

  await expect(inlineEditor).toHaveCount(0);
  await expect(
    editor.locator(".native-content-editor__objects button").filter({ hasText: "Committed by click outside" }),
  ).toHaveCount(1, { timeout: 20_000 });

  const refreshedObjects = page.locator("[data-opdf-canvas-object][data-opdf-object-kind='text']");
  await refreshedObjects.first().dblclick();
  await expect(inlineEditor).toBeVisible();
  await inlineEditor.fill("Committed before selection change");
  await refreshedObjects.nth(1).click();

  await expect(
    editor.locator(".native-content-editor__objects button").filter({ hasText: "Committed before selection change" }),
  ).toHaveCount(1, { timeout: 20_000 });

  await refreshedObjects.nth(1).dblclick();
  await expect(inlineEditor).toBeVisible();
  await inlineEditor.fill("Should be cancelled");
  await inlineEditor.press("Escape");
  await expect(inlineEditor).toHaveCount(0);
  await expect(editor.getByText("Should be cancelled", { exact: false })).toHaveCount(0);
  await expect(
    editor.locator(".native-content-editor__objects button").filter({ hasText: "Second native text" }),
  ).toHaveCount(1);
});

test("rapid native mutations serialize and viewer root stays mounted", async ({ page, request }) => {
  await openCanvasEditor(page, request);

  const editor = page.locator("[data-opdf-native-editor='true']");
  const objectButton = editor.locator("[data-opdf-object-kind='text']").filter({ hasText: "Canvas native text" }).first();
  await objectButton.click();

  const surface = page.locator(".native-edit-surface");
  await expect(surface).toBeVisible();
  await surface.evaluate((element) => element.setAttribute("data-lifecycle-marker", "stable"));

  const beforeRaw = await objectButton.getAttribute("data-opdf-bounds");
  expect(beforeRaw).toBeTruthy();
  const before = parseBounds(beforeRaw);

  const right = editor.getByRole("button", { name: "→" });
  await right.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });

  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await expect(editor.getByText("Native content edit undone.")).toBeVisible({ timeout: 20_000 });
  const movedButton = editor.locator("[data-opdf-object-kind='text']").filter({ hasText: "Canvas native text" }).first();
  await expect(movedButton).toBeVisible();
  await expect.poll(async () => parseBounds(await movedButton.getAttribute("data-opdf-bounds")).x)
    .toBeGreaterThanOrEqual(before.x + 4.9);
  const undoneX = parseBounds(await movedButton.getAttribute("data-opdf-bounds")).x;
  expect(undoneX).toBeLessThan(before.x + 9.9);
  await expect(surface).toHaveAttribute("data-lifecycle-marker", "stable");
});


test("resize and rotate keep optimistic geometry until persistence completes", async ({ page, request }) => {
  await openCanvasEditor(page, request);

  const editor = page.locator("[data-opdf-native-editor='true']");
  await editor.locator("[data-opdf-object-kind='text']").filter({ hasText: "Canvas native text" }).first().click();

  const selection = page.locator("[data-opdf-canvas-selection]");
  const beforeResize = await selection.boundingBox();
  expect(beforeResize).not.toBeNull();

  const resize = page.locator("[data-opdf-resize-handle='se']");
  const resizeBox = await resize.boundingBox();
  expect(resizeBox).not.toBeNull();
  if (!resizeBox) throw new Error("Resize handle is unavailable.");
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 24, resizeBox.y + resizeBox.height / 2 + 12, { steps: 4 });
  await page.mouse.up();

  const optimisticResize = await selection.boundingBox();
  expect(optimisticResize).not.toBeNull();
  expect((optimisticResize?.width ?? 0)).not.toBeCloseTo(beforeResize?.width ?? 0, 0);
  await expect(editor.getByText("Object resized on page.")).toBeVisible({ timeout: 20_000 });
  const persistedResize = await selection.boundingBox();
  expect(persistedResize).not.toBeNull();
  expect(Math.abs((persistedResize?.width ?? 0) - (optimisticResize?.width ?? 0))).toBeLessThan(3);

  const rotate = page.locator("[data-opdf-rotate-handle='true']");
  const rotateBox = await rotate.boundingBox();
  expect(rotateBox).not.toBeNull();
  if (!rotateBox) throw new Error("Rotate handle is unavailable.");
  const beforeRotate = await selection.getAttribute("points");
  await page.mouse.move(rotateBox.x + rotateBox.width / 2, rotateBox.y + rotateBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rotateBox.x + rotateBox.width / 2 + 30, rotateBox.y + rotateBox.height / 2 + 18, { steps: 4 });
  await page.mouse.up();

  const optimisticRotate = await selection.getAttribute("points");
  expect(optimisticRotate).not.toBe(beforeRotate);
  await expect(editor.getByText("Object rotated on page.")).toBeVisible({ timeout: 20_000 });
  const persistedRotate = await selection.getAttribute("points");
  expect(persistedRotate).toBe(optimisticRotate);
});


test("closing native editor commits the active inline text edit", async ({ page, request }) => {
  await openCanvasEditor(page, request);

  const canvasText = page.locator("[data-opdf-canvas-object][data-opdf-object-kind='text']").first();
  await canvasText.dblclick();
  const inlineEditor = page.locator("[data-opdf-inline-text-editor='true']");
  await inlineEditor.fill("Committed before editor close");

  await page.getByRole("button", { name: "Close Edit PDF" }).click();
  await expect(page.locator("[data-opdf-native-editor='true']")).toHaveCount(0);

  await page.getByTitle("Edit PDF Content").click();
  const expand = page.locator("[data-opdf-action='expand-right-panel']");
  if (await expand.isVisible()) await expand.click();
  const reopened = page.locator("[data-opdf-native-editor='true']");
  await expect(reopened).toBeVisible({ timeout: 20_000 });
  await expect(
    reopened.locator("[data-opdf-object-kind='text']").filter({ hasText: "Committed before editor close" }),
  ).toHaveCount(1, { timeout: 20_000 });
});
