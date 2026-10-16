import { expect, type Page } from "@playwright/test";

export async function saveServerDocumentAndWait(page: Page) {
  const desktopSave = page.locator('[data-tpdf-action="save"]').first();
  const mobileSave = page.locator('[data-tpdf-action="mobile-save"]').first();
  await expect.poll(async () => await desktopSave.isVisible() || await mobileSave.isVisible(), {
    timeout: 10_000,
    message: "a desktop or mobile Save control is visible",
  }).toBe(true);
  const saveButton = await desktopSave.isVisible() ? desktopSave : mobileSave;
  await expect(saveButton).toBeEnabled({ timeout: 30_000 });
  // Wait for manual Save to become clickable before arming the PUT waiter.
  // Earlier autosaves must not consume its 30-second response budget.
  const saveResponse = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "PUT" &&
        /^\/api\/tpdf\/documents\/[^/]+$/.test(url.pathname)
      );
    },
    { timeout: 30_000 },
  );

  await saveButton.click({ timeout: 10_000 });
  const response = await saveResponse;
  expect(response.ok()).toBeTruthy();
  await expect(
    page.locator('[data-tpdf-region="status-bar"][data-tpdf-save-state="saved"]'),
  ).toBeVisible({ timeout: 30_000 });
}
