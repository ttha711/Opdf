import { expect, type Locator, type Page } from "@playwright/test";

const UI_ACTION_TIMEOUT = 10_000;

const APPLICATION_MENU_PATHS: Record<string, string[]> = {
  "Close": ["Document", "Close"],
  "Save": ["Document", "Save"],
  "Save As...": ["Document", "Save As..."],
  "Export PDF...": ["Document", "Export PDF..."],
  "Undo": ["Edit", "Undo"],
  "Redo": ["Edit", "Redo"],
  "Zoom In": ["View", "Zoom", "Zoom In"],
  "Zoom Out": ["View", "Zoom", "Zoom Out"],
  "Actual Size (100%)": ["View", "Zoom", "Actual Size (100%)"],
  "Fit Width": ["View", "Zoom", "Fit Width"],
  "Fit Page": ["View", "Zoom", "Fit Page"],
  "Rotate Page Left": ["View", "Rotate", "Rotate Page Left"],
  "Rotate Page Right": ["View", "Rotate", "Rotate Page Right"],
  "Rotate All Pages Left": ["View", "Rotate", "Rotate All Pages Left"],
  "Rotate All Pages Right": ["View", "Rotate", "Rotate All Pages Right"],
  "All Tools...": ["Tools", "All Tools..."],
  "Back to Document": ["Tools", "Back to Document"],
  "Insert PDF...": ["Tools", "Pages", "Insert PDF..."],
  "Split PDF...": ["Tools", "Pages", "Split PDF..."],
  "Merge PDFs...": ["Tools", "Pages", "Merge PDFs..."],
  "Run OCR": ["Tools", "Document", "Run OCR"],
  "Page Numbers...": ["Tools", "Document", "Page Numbers..."],
  "Header...": ["Tools", "Document", "Header..."],
  "Footer...": ["Tools", "Document", "Footer..."],
  "Bates Numbering...": ["Tools", "Document", "Bates Numbering..."],
  "Watermark...": ["Tools", "Document", "Watermark..."],
  "Compress PDF": ["Tools", "Convert & Optimize", "Compress PDF"],
  "Convert to Images": ["Tools", "Convert & Optimize", "Convert to Images"],
  "Edit PDF Content": ["Tools", "Edit & Review", "Edit PDF Content"],
  "Measure Drawing": ["Tools", "Edit & Review", "Measure Drawing"],
  "Compare Revisions...": ["Tools", "Edit & Review", "Compare Revisions..."],
  "Search & Secure Redact...": ["Tools", "Security", "Search & Secure Redact..."],
  "Digital Sign...": ["Tools", "Security", "Digital Sign..."],
  "Advanced PDF...": ["Tools", "Advanced PDF..."],
};

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
  return getApplicationMenuPathItem(page, APPLICATION_MENU_PATHS[label] ?? [label]);
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
