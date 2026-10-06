import { expect, type Locator, type Page } from "@playwright/test";

const UI_ACTION_TIMEOUT = 10_000;

function menuItemSelector(label: string) {
  const escaped = label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `[data-opdf-menu-item="${escaped}"]`;
}

export async function openApplicationMenu(page: Page) {
  const header = page.locator('[data-opdf-region="app-header"]');
  const trigger = header.locator('button[aria-label="Application menu"]:visible').first();
  await expect(trigger).toBeVisible({ timeout: UI_ACTION_TIMEOUT });

  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click({ timeout: UI_ACTION_TIMEOUT });
  }

  const menu = trigger.locator("xpath=..").locator('[role="menu"]').first();
  await expect(menu).toBeVisible({ timeout: UI_ACTION_TIMEOUT });
  return menu;
}

export async function getApplicationMenuItem(page: Page, label: string): Promise<Locator> {
  const menu = await openApplicationMenu(page);
  const item = menu.locator(menuItemSelector(label)).first();
  await expect(item).toBeVisible({ timeout: UI_ACTION_TIMEOUT });
  return item;
}

export async function clickApplicationMenuItem(page: Page, label: string) {
  const item = await getApplicationMenuItem(page, label);
  await item.click({ timeout: UI_ACTION_TIMEOUT });
}
