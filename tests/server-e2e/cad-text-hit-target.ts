import { type Page } from "@playwright/test";

const selector = '.native-edit-page polygon[data-opdf-object-kind="text"]';

type Hit = { x: number; y: number };
type TargetState = {
  mounted: boolean;
  pageCount: number;
  viewport: number[] | null;
  target: number[] | null;
};

/**
 * Inspect the current DOM rather than holding an ElementHandle across scrolling.
 * EmbedPDF virtualizes/recreates page overlays while the large CAD sheet moves.
 */
async function realHitPoint(page: Page, objectId: string): Promise<Hit | null> {
  return page.evaluate(({ selector, objectId }) => {
    const node = document.querySelector<SVGPolygonElement>(
      selector + '[data-opdf-canvas-object="' + objectId + '"]',
    );
    const view = document.querySelector(".native-edit-viewport")?.getBoundingClientRect();
    if (!node || !view) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    const x0 = Math.max(rect.left + 0.5, view.left + 8);
    const x1 = Math.min(rect.right - 0.5, view.right - 8);
    const y0 = Math.max(rect.top + 0.5, view.top + 8);
    const y1 = Math.min(rect.bottom - 0.5, view.bottom - 8);
    if (x0 >= x1 || y0 >= y1) return null;
    for (const fx of [0.5, 0.25, 0.75, 0.1, 0.9]) {
      for (const fy of [0.5, 0.25, 0.75, 0.1, 0.9]) {
        const x = x0 + (x1 - x0) * fx;
        const y = y0 + (y1 - y0) * fy;
        if (document.elementFromPoint(x, y) === node) return { x, y };
      }
    }
    return null;
  }, { selector, objectId });
}

/**
 * Scroll synchronously in the browser. Playwright's scrollIntoViewIfNeeded()
 * waits for an element to remain stable, which can never happen when scrolling
 * causes EmbedPDF to replace that element's whole page overlay.
 */
async function bringPinnedTextIntoView(page: Page, objectId: string): Promise<boolean> {
  return page.evaluate(({ selector, objectId }) => {
    const node = document.querySelector(
      selector + '[data-opdf-canvas-object="' + objectId + '"]',
    );
    if (!node) return false;
    node.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    return true;
  }, { selector, objectId });
}

async function targetState(page: Page, objectId: string): Promise<TargetState> {
  return page.evaluate(({ selector, objectId }) => {
    const node = document.querySelector(
      selector + '[data-opdf-canvas-object="' + objectId + '"]',
    );
    const view = document.querySelector(".native-edit-viewport")?.getBoundingClientRect();
    const rect = node?.getBoundingClientRect();
    const round = (values: number[]) => values.map((value) => Math.round(value));
    return {
      mounted: !!node,
      pageCount: document.querySelectorAll(".native-edit-page").length,
      viewport: view ? round([view.left, view.top, view.width, view.height]) : null,
      target: rect ? round([rect.left, rect.top, rect.width, rect.height]) : null,
    };
  }, { selector, objectId });
}

/** Double-click a pinned real CAD label at a verified, physical hit point. */
export async function openClickableCadText(page: Page, objectId: string): Promise<void> {
  const input = page.getByRole("textbox", { name: "Edit PDF text" });
  const target = page.locator(selector + '[data-opdf-canvas-object="' + objectId + '"]');
  await target.waitFor({ state: "attached", timeout: 45_000 });
  await bringPinnedTextIntoView(page, objectId);

  for (let attempt = 0; attempt < 10; attempt++) {
    await page.waitForTimeout(200);
    const point = await realHitPoint(page, objectId);
    if (point) {
      // Only an actual polygon hit may open the inline editor.
      await page.mouse.dblclick(point.x, point.y, { delay: 45 });
      if (await input.isVisible().catch(() => false)) return;
    }

    if (attempt === 3) {
      // Dense drawings can fully overlap labels. Selecting the pinned object
      // from the real object sidebar raises its SVG hit target above neighbors.
      // The edit itself must still be opened by an actual canvas double-click.
      const search = page.getByRole("searchbox", { name: "Find PDF object" });
      if (await search.isVisible().catch(() => false)) {
        await search.fill(objectId);
        await page.locator('[data-opdf-object-id="' + objectId + '"]').click();
        await page.locator('[data-opdf-canvas-selection="' + objectId + '"]')
          .waitFor({ state: "attached", timeout: 15000 });
        await bringPinnedTextIntoView(page, objectId);
      }
    }
    const box = await page.locator(".native-edit-viewport").boundingBox();
    if (!box) break;
    // Reacquire the node after virtualization instead of scrolling a stale
    // locator. Keep exploratory zoom, needed for tiny engineering labels.
    if (attempt === 2 || attempt === 6) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -450);
      await page.keyboard.up("Control");
    } else if (attempt === 4 || attempt === 8) {
      await bringPinnedTextIntoView(page, objectId);
    } else {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, attempt % 2 === 0 ? 250 : -250);
    }
  }
  const state = await targetState(page, objectId);
  throw new Error(
    "Pinned CAD text could not be double-clicked at a real viewport hit point: " +
    objectId + "; " + JSON.stringify(state),
  );
}
