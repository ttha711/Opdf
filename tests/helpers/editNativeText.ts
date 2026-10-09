import { expect, type Locator, type Page } from "@playwright/test";

/** Replace text through the single canvas editor used by the web UI. */
export async function replaceNativeTextFromCanvas(
  page: Page,
  editor: Locator,
  listedObject: Locator,
  replacement: string,
) {
  const objectId = await listedObject.getAttribute("data-opdf-object-id");
  expect(objectId).toBeTruthy();
  const canvasObject = page.locator(`[data-opdf-canvas-object="${objectId}"]`);
  await canvasObject.dblclick();
  const input = page.getByRole("textbox", { name: "Edit PDF text" });
  await expect(input).toBeVisible();
  await input.fill(replacement);
  await input.press("Enter");
  await expect(input).toHaveCount(0, { timeout: 45_000 });
  await expect(editor.getByText("Text applied. Check the Save status in the toolbar.")).toBeVisible({
    timeout: 45_000,
  });
  await expect(editor.locator('.native-content-editor__objects [data-opdf-object-kind="text"]')
    .filter({ hasText: replacement }).first()).toBeVisible({ timeout: 45_000 });
}
