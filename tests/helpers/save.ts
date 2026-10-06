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

  const saveButton = page.locator('[data-opdf-action="save"]').first();
  await expect(saveButton).toBeVisible({ timeout: 10_000 });
  await expect(saveButton).toBeEnabled({ timeout: 30_000 });
  await saveButton.click({ timeout: 10_000 });
  const response = await saveResponse;
  expect(response.ok()).toBeTruthy();
  await expect(
    page.locator('[data-opdf-region="status-bar"][data-opdf-save-state="saved"]'),
  ).toBeVisible({ timeout: 30_000 });
}
