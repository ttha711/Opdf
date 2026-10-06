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
  const item = menu.locator(`${menuItemSelector(label)}:visible`).first();
  await expect(item).toBeVisible({ timeout: UI_ACTION_TIMEOUT });
  return item;
}

export async function getApplicationMenuPathItem(page: Page, path: string[]): Promise<Locator> {
  if (path.length === 0) throw new Error("Application menu path must contain at least one label.");

  const menu = await openApplicationMenu(page);
  let item: Locator | null = null;

  for (let index = 0; index < path.length; index += 1) {
    const label = path[index];
    item = menu.locator(`${menuItemSelector(label)}:visible`).first();
    await expect(item).toBeVisible({ timeout: UI_ACTION_TIMEOUT });

    if (index < path.length - 1) {
      if ((await item.getAttribute("aria-expanded")) !== "true") {
        await item.click({ timeout: UI_ACTION_TIMEOUT });
      }
      await expect(item).toHaveAttribute("aria-expanded", "true", { timeout: UI_ACTION_TIMEOUT });
    }
  }

  return item!;
}

export async function clickApplicationMenuItem(page: Page, label: string) {
  const item = await getApplicationMenuItem(page, label);
  await item.click({ timeout: UI_ACTION_TIMEOUT });
}

export async function clickApplicationMenuPath(page: Page, path: string[]) {
  const item = await getApplicationMenuPathItem(page, path);
  await item.click({ timeout: UI_ACTION_TIMEOUT });
}
