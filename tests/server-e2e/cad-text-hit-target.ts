import { expect, type Page } from "@playwright/test";

const selector = '.native-edit-page polygon[data-opdf-object-kind="text"]';

type Hit = { x: number; y: number };

async function realHitPoint(page: Page, objectId: string): Promise<Hit | null> {
  return page.locator(selector + '[data-opdf-canvas-object="' + objectId + '"]').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const view = document.querySelector(".native-edit-viewport")?.getBoundingClientRect();
    if (!view || rect.width < 2 || rect.height < 2) return null;
    const x0 = Math.max(rect.left + 0.5, view.left + 8);
    const x1 = Math.min(rect.right - 0.5, view.right - 8);
    const y0 = Math.max(rect.top + 0.5, view.top + 8);
    const y1 = Math.min(rect.bottom - 0.5, view.bottom - 8);
    if (x0 >= x1 || y0 >= y1) return null;
    for (const fx of [0.5, 0.25, 0.75, 0.1, 0.9]) {
      for (const fy of [0.5, 0.25, 0.75, 0.1, 0.9]) {
        const x = x0 + (x1 - x0) * fx, y = y0 + (y1 - y0) * fy;
        if (document.elementFromPoint(x, y) === node) return { x, y };
      }
    }
    return null;
  });
}

/** Click an unchanged, pinned CAD label using physical mouse coordinates. */
export async function openClickableCadText(page: Page, objectId: string): Promise<void> {
  const target = page.locator(selector + '[data-opdf-canvas-object="' + objectId + '"]');
  await expect(target, "Pinned CAD text must be present in the native SVG overlay").toHaveCount(1, {
    timeout: 45_000,
  });
  const input = page.getByRole("textbox", { name: "Edit PDF text" });
  await target.scrollIntoViewIfNeeded({ timeout: 15000 });
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.waitForTimeout(160);
    const point = await realHitPoint(page, objectId);
    if (point) {
      // No Playwright auto-scrolling/re-centering between hit test and click.
      await page.mouse.dblclick(point.x, point.y, { delay: 45 });
      if (await input.isVisible().catch(() => false)) return;
    }
    const box = await page.locator(".native-edit-viewport").boundingBox();
    if (!box) break;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    if (attempt === 2 || attempt === 5) {
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -450);
      await page.keyboard.up("Control");
    } else {
      await page.mouse.wheel(0, attempt % 2 === 0 ? 250 : -250);
    }
    await target.scrollIntoViewIfNeeded({ timeout: 15000 });
  }
  throw new Error("Pinned CAD text could not be double-clicked at a real viewport hit point: " + objectId);
}
