import { expect, test } from "@playwright/test";

const viewports = [
  { width: 360, height: 740, label: "small-mobile" },
  { width: 393, height: 852, label: "android" },
  { width: 768, height: 1024, label: "tablet" },
  { width: 1366, height: 768, label: "desktop" },
];

for (const viewport of viewports) {
  test(`responsive layout audit: ${viewport.label}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.screenshot({ path: testInfo.outputPath(`home-${viewport.label}.png`), fullPage: true });

    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const visible = (node: Element) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const candidates = [...document.querySelectorAll("body *")]
        .filter(visible)
        .map((node) => ({ element: node.tagName.toLowerCase(), cls: String(node.className).slice(0, 100), right: node.getBoundingClientRect().right }))
        .filter((item) => item.right > innerWidth + 2)
        .slice(0, 12);
      return { viewportWidth: innerWidth, documentWidth: doc.scrollWidth, overflowing: candidates };
    });
    expect.soft(metrics.documentWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(viewport.width + 2);
    expect.soft(errors, "Uncaught browser errors").toEqual([]);
    await testInfo.attach("layout-metrics", {
      body: Buffer.from(JSON.stringify(metrics, null, 2)), contentType: "application/json",
    });
  });
}

test("mobile tab overview keeps one card compact", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  const open = page.locator('[data-tpdf-action="open-tab-switcher"]');
  if (!await open.isVisible()) return;
  await open.click();
  const modal = page.locator('[data-tpdf-tab-switcher="open"]');
  await expect(modal).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mobile-tab-overview.png") });
  const one = modal.locator('.mobile-tab-grid[data-tpdf-tab-count="1"] .mobile-tab-card');
  if (await one.count()) {
    const card = await one.boundingBox();
    expect(card?.height ?? 0).toBeLessThan(350);
  }
});
