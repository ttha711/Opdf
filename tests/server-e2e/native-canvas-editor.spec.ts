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

function boundsX(value: string | null) {
  return Number(value?.split(",")[0] ?? Number.NaN);
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
  const viewerRoot = page.locator("[data-opdf-native-viewer-root='true']");
  const viewerInstance = await viewerRoot.getAttribute("data-opdf-native-viewer-instance");
  expect(viewerInstance).toBeTruthy();
  const textObject = page.locator("[data-opdf-canvas-object][data-opdf-object-kind='text']").first();
  await expect(textObject).toBeVisible({ timeout: 20_000 });

  const before = await textObject.boundingBox();
  expect(before).not.toBeNull();
  if (!before) throw new Error("Text object bounding box is unavailable.");

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 24, before.y + before.height / 2 - 12, { steps: 4 });
  const preview = await page.locator("[data-opdf-canvas-selection]").boundingBox();
  expect(preview).not.toBeNull();
  expect(preview?.x ?? 0).toBeGreaterThan(before.x + 10);

  await page.evaluate(() => {
    const samples: number[] = [];
    (window as any).__opdfDragSamples = samples;
    (window as any).__opdfSampleDrag = true;
    const sample = () => {
      if (!(window as any).__opdfSampleDrag) return;
      const element = document.querySelector("[data-opdf-canvas-selection]");
      if (element) samples.push(element.getBoundingClientRect().x);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.mouse.up();
  await expect(editor.getByText("Object moved on page.")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(100);
  const samples = await page.evaluate(() => {
    (window as any).__opdfSampleDrag = false;
    return (window as any).__opdfDragSamples as number[];
  });
  expect(samples.length).toBeGreaterThan(0);
  expect(Math.min(...samples)).toBeGreaterThan(before.x + 8);
  await expect(viewerRoot).toHaveAttribute("data-opdf-native-viewer-instance", viewerInstance ?? "");

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
  await expect(editor.locator("[data-opdf-object-kind='text']")).toHaveCount(2, { timeout: 20_000 });

  await page.locator("[data-opdf-native-edit-page='1']").click({ position: { x: 8, y: 8 } });
  await expect(page.locator("[data-opdf-canvas-selection]")).toHaveCount(0);
});


test("inline text commits before click-outside deselection and Escape cancels", async ({ page, request }) => {
  await openCanvasEditor(page, request);
  const editor = page.locator("[data-opdf-native-editor='true']");
  const selection = page.locator("[data-opdf-canvas-selection]");
  const object = page.locator("[data-opdf-canvas-object][data-opdf-object-kind='text']").first();

  await object.dblclick();
  const inline = page.locator("[data-opdf-inline-text-editor='true']");
  await expect(inline).toBeVisible();
  await inline.fill("Saved by click outside");

  await page.locator("[data-opdf-native-edit-page='1']").click({ position: { x: 8, y: 8 } });
  await expect(editor.getByText(/Inline text updated/)).toBeVisible({ timeout: 20_000 });
  await expect(inline).toHaveCount(0);
  await expect(selection).toHaveCount(0);
  await expect(
    editor.locator("[data-opdf-object-kind='text']").filter({ hasText: "Saved by click outside" }),
  ).toBeVisible({ timeout: 20_000 });

  const updatedObject = page.locator("[data-opdf-canvas-object][data-opdf-object-kind='text']").first();
  await updatedObject.dblclick();
  await expect(inline).toBeVisible();
  await inline.fill("This must be cancelled");
  await inline.press("Escape");
  await expect(inline).toHaveCount(0);
  await expect(
    editor.locator("[data-opdf-object-kind='text']").filter({ hasText: "Saved by click outside" }),
  ).toBeVisible();
  await expect(editor).not.toContainText("This must be cancelled");
});

test("rapid native mutations serialize and immediate undo sees the latest bytes", async ({ page, request }) => {
  await openCanvasEditor(page, request);
  const editor = page.locator("[data-opdf-native-editor='true']");
  const objectButton = editor.locator("[data-opdf-object-kind='text']").first();
  await objectButton.click();

  const before = boundsX(await objectButton.getAttribute("data-opdf-bounds"));
  expect(Number.isFinite(before)).toBeTruthy();

  const moveRight = editor.getByRole("button", { name: "→", exact: true });
  await moveRight.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });

  await expect.poll(async () => {
    const current = editor.locator("[data-opdf-object-kind='text']").first();
    return boundsX(await current.getAttribute("data-opdf-bounds"));
  }, { timeout: 30_000 }).toBeGreaterThan(before + 9);

  const moved = boundsX(await editor.locator("[data-opdf-object-kind='text']").first().getAttribute("data-opdf-bounds"));
  expect(moved).toBeGreaterThan(before + 9);

  await moveRight.evaluate((element) => (element as HTMLButtonElement).click());
  await page.keyboard.press("Control+z");

  await expect.poll(async () => {
    const current = editor.locator("[data-opdf-object-kind='text']").first();
    return boundsX(await current.getAttribute("data-opdf-bounds"));
  }, { timeout: 30_000 }).toBeCloseTo(moved, 2);
});
