import type { Locator, Page } from "@playwright/test";

// Scan the *actual* browser hit map rather than picking the first PDF text
// object. PDF CAD exports can contain many microscopic or overlaid glyphs.
// Move through the visible document with real wheel gestures if necessary.
export async function findClickableCadText(page: Page): Promise<Locator> {
  const selector = '.native-edit-page polygon[data-opdf-object-kind="text"]' +
    ':is([data-opdf-object-depth="0"], [data-opdf-object-depth="1"])';
  const targets = page.locator(selector);
  const viewport = page.locator(".native-edit-viewport");
  for (let step = 0; step < 12; step++) {
    const candidateIndex = await targets.evaluateAll((nodes) => {
      const view = document.querySelector(".native-edit-viewport")?.getBoundingClientRect();
      if (!view) return -1;
      let best = -1;
      let score = -1;
      nodes.forEach((node, index) => {
        const rect = node.getBoundingClientRect();
        if (rect.width < 12 || rect.height < 6) return;
        for (const fx of [0.2, 0.5, 0.8]) {
          for (const fy of [0.25, 0.5, 0.75]) {
            const x = rect.left + fx * rect.width;
            const y = rect.top + fy * rect.height;
            if (x < view.left + 8 || x > view.right - 8 ||
                y < view.top + 8 || y > view.bottom - 8) continue;
            if (document.elementFromPoint(x, y) !== node) continue;
            const area = Math.min(15000, rect.width * rect.height);
            if (area > score) { score = area; best = index; }
          }
        }
      });
      return best;
    });
    if (candidateIndex >= 0) return targets.nth(candidateIndex);
    if (step === 11) break;
    const box = await viewport.boundingBox();
    if (!box) break;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, Math.max(250, Math.round(box.height * 0.65)));
    await page.waitForTimeout(200);
  }
  throw new Error("No physically clickable CAD text was found after scanning the visible pages.");
}
