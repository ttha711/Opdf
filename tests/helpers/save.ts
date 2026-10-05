import { expect, type Page } from "@playwright/test";

export async function saveServerDocumentAndWait(page: Page) {
  const saveResponse = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "PUT" &&
        /^\/api\/opdf\/documents\/[^/]+$/.test(url.pathname)
      );
    },
    { timeout: 30_000 },
  );

  await page.getByTitle("Save (Ctrl+S)").click();
  const response = await saveResponse;
  expect(response.ok()).toBeTruthy();
  await expect(page.locator('[data-opdf-save-state="saved"]')).toBeVisible({ timeout: 30_000 });
}
