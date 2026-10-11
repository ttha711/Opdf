import { expect, type Page } from "@playwright/test";

export async function saveServerDocumentAndWait(page: Page) {
  const savedStatus = page.locator('[data-opdf-region="status-bar"][data-opdf-save-state="saved"]');
  const savingStatus = page.locator('[data-opdf-region="status-bar"][data-opdf-save-state="saving"]');

  // Autosave may finish committing the edited bytes before a manual click.
  // A second PUT is not required; callers still reload to verify persistence.
  if (await savingStatus.isVisible()) {
    await expect(savedStatus).toBeVisible({ timeout: 90_000 });
    return;
  }

  const saveResponse = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "PUT" &&
        /^\/api\/opdf\/documents\/[^/]+$/.test(url.pathname)
      );
    },
    { timeout: 90_000 },
  );

  const saveButton = page.locator('[data-opdf-action="save"]').first();
  await expect(saveButton).toBeVisible({ timeout: 10_000 });
  await expect(saveButton).toBeEnabled({ timeout: 30_000 });
  await saveButton.click({ timeout: 10_000 });
  // The network response may belong to a background autosave that completed
  // before the manual click. In that case the Saved state is authoritative.
  const outcome = await Promise.race([
    saveResponse.then((response) => { expect(response.ok()).toBeTruthy(); return "response"; }),
    savedStatus.waitFor({ state: "visible", timeout: 90_000 }).then(() => "saved"),
  ]);
  expect(["response", "saved"]).toContain(outcome);
  await expect(savedStatus).toBeVisible({ timeout: 90_000 });
}
