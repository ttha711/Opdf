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
        const hit = document.elementFromPoint(x, y);
        if (hit === node || hit?.getAttribute("data-opdf-foreground-hit-target") === objectId) {
          return { x, y };
        }
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
    node.scrollIntoView({ block: "end", inline: "nearest", behavior: "instant" });
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

/** Double-click the exact CAD object, then fall back to the selected-object action. */
export async function openClickableCadText(page: Page, objectId: string): Promise<void> {
  const input = page.getByRole("textbox", { name: "Edit PDF text" });
  const target = page.locator(selector + '[data-opdf-canvas-object="' + objectId + '"]');
  await target.waitFor({ state: "attached", timeout: 45_000 });

  const search = page.getByRole("searchbox", { name: "Find PDF object" });
  for (let attempt = 0; attempt < 6; attempt++) {
    // Selection must precede the physical double-click. Otherwise the first
    // click changes the topmost SVG target and the second hits another node.
    if (await search.isVisible().catch(() => false)) {
      await search.fill(objectId);
      // The inspector row is virtualized and can be replaced during Playwright's
      // click stability check. Dispatch its normal DOM click directly only if
      // the target isn't already selected, then verify the canvas selection.
      const selection = page.locator('[data-opdf-canvas-selection="' + objectId + '"]');
      if (await selection.count() === 0) {
        await page.locator('[data-opdf-object-id="' + objectId + '"]')
          .evaluate((node: HTMLElement) => node.click());
        await selection.waitFor({ state: "attached", timeout: 15_000 });
      }
    }
    // Avoid speculative wheel events: they can virtualize the page away.
    await bringPinnedTextIntoView(page, objectId);
    await page.waitForTimeout(200);
    const point = await realHitPoint(page, objectId);
    if (!point) continue;
    await page.mouse.dblclick(point.x, point.y, { delay: 45 });
    if (await input.isVisible().catch(() => false)) {
      const actualObject = await input.getAttribute("data-opdf-inline-object-id");
      if (actualObject === objectId) return;
      await input.press("Escape");
      await input.waitFor({ state: "detached", timeout: 5000 });
    }
  }

  // Dense CAD linework can cover every physical hit point on the text bounds.
  // Selecting the exact object in the inspector opens the same inline editor,
  // so the user still gets one edit/commit flow without requiring pixel hunting.
  if (await search.isVisible().catch(() => false)) {
    await search.fill(objectId);
    const row = page.locator('[data-opdf-object-id="' + objectId + '"]');
    const selection = page.locator('[data-opdf-canvas-selection="' + objectId + '"]');
    if (await selection.count() === 0) {
      await row.evaluate((node: HTMLElement) => node.click());
      await selection.waitFor({ state: "attached", timeout: 15_000 });
    }
    await page.getByRole("button", { name: "Edit selected text", exact: true }).click();
    await input.waitFor({ state: "visible", timeout: 15_000 });
    if (await input.getAttribute("data-opdf-inline-object-id") === objectId) return;
    await input.press("Escape");
  }

  const state = await targetState(page, objectId);
  throw new Error(
    "Pinned CAD text could not be double-clicked at a real viewport hit point: " +
    objectId + "; " + JSON.stringify(state),
  );
}
