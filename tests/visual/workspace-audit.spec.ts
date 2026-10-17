import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const sizes = [
  { name: "mobile-360", width: 360, height: 740 },
  { name: "mobile-393", width: 393, height: 852 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1366", width: 1366, height: 768 },
  { name: "desktop-1920", width: 1920, height: 1080 },
];

async function fixturePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 3; n++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Page ${n} content for mobile tool testing`, {
      x: 45, y: 745, size: 17, font,
    });
  }
  return Buffer.from(await pdf.save());
}

async function snapshot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(name + ".png"), fullPage: true, animations: "disabled" });
  const metrics = await page.evaluate(() => {
    const regions = [
      "[data-tpdf-region='app-header']",
      "[data-tpdf-region='status-bar']",
      ".viewer-area", ".tpdf-mobile-edit-toolbar", ".viewer-quick-tools",
      "[data-tpdf-action='open-ai']", ".mobile-tab-grid",
      ".mobile-tab-card", ".tpdf-side-panel--right",
    ];
    const boxes = regions.flatMap((selector) => [...document.querySelectorAll(selector)].map((item) => {
      const rect = item.getBoundingClientRect();
      const style = getComputedStyle(item);
      return { selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        visible: style.display !== "none" && style.visibility !== "hidden" };
    }));
    return { viewport: [innerWidth, innerHeight], bodyWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth, boxes };
  });
  await info.attach(name + "-layout", {
    body: Buffer.from(JSON.stringify(metrics, null, 2)), contentType: "application/json",
  });
  expect.soft(metrics.horizontalOverflow, name + " overflows the viewport").toBeLessThanOrEqual(2);
  return metrics;
}

async function openFixture(page: Page, bytes: Buffer) {
  const picker = page.locator('input[type="file"][accept*="pdf"]').first();
  await expect(picker).toBeAttached();
  await picker.setInputFiles({ name: "mobile-modal-audit.pdf", mimeType: "application/pdf", buffer: bytes });
  await expect(page.locator('[data-tpdf-region="status-bar"][data-tpdf-has-document="true"]'))
    .toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="page-status"]')).toContainText("of 3", { timeout: 30_000 });
}

for (const size of sizes) {
  test(`visual walkthrough ${size.name}`, async ({ page }, info) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    if (await page.getByRole("heading", { name: /sign in to tpdf/i }).isVisible().catch(() => false)) {
      await snapshot(page, info, "00-login");
      test.skip(true, "Target requires authentication; provide a Playwright storageState for authorized testing.");
    }
    await snapshot(page, info, "01-home");
    const file = await fixturePdf();
    await openFixture(page, file);
    await snapshot(page, info, "02-pdf-viewer");
    if (size.width <= 900) {
      const tabs = page.locator('[data-tpdf-action="open-tab-switcher"]');
      await expect(tabs).toBeVisible();
      await tabs.click();
      await expect(page.locator('[data-tpdf-tab-switcher="open"]')).toBeVisible();
      const { boxes } = await snapshot(page, info, "03-tabs-overview");
      const tab = boxes.find(box => box.selector === ".mobile-tab-card" && box.visible);
      if (tab) expect.soft(tab.height, "Single tab card must be compact").toBeLessThan(350);
      await page.locator('[data-tpdf-action="close-tab-switcher"]').click();
    }
    const menu = page.getByRole("button", { name: /application menu/i }).first();
    if (await menu.isVisible()) {
      await menu.click();
      await snapshot(page, info, "04-application-menu");
      await menu.click().catch(() => {});
    }
    const ai = page.locator('[data-tpdf-action="open-ai"]');
    if (await ai.isVisible()) {
      await ai.click();
      await snapshot(page, info, "05-ai-panel");
    }
    expect.soft(errors, "Unexpected page errors").toEqual([]);
  });
}
