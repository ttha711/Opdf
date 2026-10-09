import { expect, type Page } from "@playwright/test";

type Hit = { id: string; x: number; y: number; area: number };
const selector = '.native-edit-page polygon[data-opdf-object-kind="text"]' +
  ':is([data-opdf-object-depth="0"], [data-opdf-object-depth="1"])';

async function getVisibleHits(page: Page, minW: number, minH: number): Promise<Hit[]> {
  return page.locator(selector).evaluateAll((nodes, min: { w: number; h: number }) => {
    const v = document.querySelector(".native-edit-viewport")?.getBoundingClientRect();
    if (!v) return [];
    const hits: Hit[] = [];
    for (const node of nodes) {
      const r = node.getBoundingClientRect();
      if (r.width < min.w || r.height < min.h) continue;
      const x0 = Math.max(v.left + 8, r.left + 1), x1 = Math.min(v.right - 8, r.right - 1);
      const y0 = Math.max(v.top + 8, r.top + 1), y1 = Math.min(v.bottom - 8, r.bottom - 1);
      if (x1 <= x0 || y1 <= y0) continue;
      for (const fx of [0.5, 0.2, 0.8, 0.35, 0.65]) {
        if (hits.some(hit => hit.id === node.getAttribute("data-opdf-canvas-object"))) break;
        for (const fy of [0.5, 0.25, 0.75, 0.1, 0.9]) {
          const x = x0 + (x1 - x0) * fx, y = y0 + (y1 - y0) * fy;
          if (document.elementFromPoint(x, y) !== node) continue;
          hits.push({
            id: node.getAttribute("data-opdf-canvas-object") ?? "",
            x, y, area: Math.min(20000, r.width * r.height),
          });
          break;
        }
      }
    }
    return hits.sort((a, b) => b.area - a.area).slice(0, 8);
  }, { w: minW, h: minH });
}

/** Exercise actual double-clicks at verified visible CAD text hit coordinates. */
export async function openClickableCadText(page: Page): Promise<string> {
  const viewport = page.locator(".native-edit-viewport");
  const input = page.getByRole("textbox", { name: "Edit PDF text" });
  for (let round = 0; round < 3; round++) {
    for (let step = 0; step < 14; step++) {
      const candidates = await getVisibleHits(page, round === 0 ? 12 : 4, round === 0 ? 6 : 2);
      for (const hit of candidates) {
        const current = await page.evaluate(
          ({ x, y, id }) => document.elementFromPoint(x, y)?.getAttribute("data-opdf-canvas-object") === id,
          hit,
        );
        if (!current) continue;
        await page.mouse.dblclick(hit.x, hit.y, { delay: 45 });
        if (await input.isVisible().catch(() => false)) {
          await expect(input).toBeVisible();
          return hit.id;
        }
      }
      const box = await viewport.boundingBox();
      if (!box) break;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, Math.max(250, Math.round(box.height * 0.6)));
      await page.waitForTimeout(200);
    }
    const box = await viewport.boundingBox();
    if (!box) break;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -15000);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -400);
    await page.keyboard.up("Control");
    await page.waitForTimeout(450);
  }
  throw new Error("No CAD text could be double-clicked after real scrolling and zooming.");
}
