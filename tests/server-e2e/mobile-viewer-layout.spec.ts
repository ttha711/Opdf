import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

async function buildPdf() {
  const doc = await PDFDocument.create();
  const page1 = doc.addPage([600, 800]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page1.drawText("Mobile Viewer Test Page 1", { x: 50, y: 700, size: 24, font });
  const page2 = doc.addPage([600, 800]);
  page2.drawText("Mobile Viewer Test Page 2", { x: 50, y: 700, size: 24, font });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

test.describe("mobile layout and scrolling", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("home screen can scroll smoothly on mobile touch viewport", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".tpdf-home");

    const scrollMetrics = await page.evaluate(() => {
      const home = document.querySelector<HTMLElement>(".tpdf-home");
      const app = document.querySelector<HTMLElement>(".app");
      return {
        appHasIsHome: app?.classList.contains("is-home") ?? false,
        appGridRows: app ? getComputedStyle(app).gridTemplateRows : "",
        homeScrollHeight: home?.scrollHeight ?? 0,
        homeClientHeight: home?.clientHeight ?? 0,
        homeOverflowY: home ? getComputedStyle(home).overflowY : "",
        homeTouchAction: home ? getComputedStyle(home).touchAction : "",
      };
    });

    expect(scrollMetrics.appHasIsHome).toBe(true);
    expect(scrollMetrics.homeOverflowY).toBe("auto");
    expect(scrollMetrics.homeScrollHeight).toBeGreaterThan(scrollMetrics.homeClientHeight);

    // Verify scrolling down and reading scrollTop
    await page.evaluate(() => {
      const home = document.querySelector<HTMLElement>(".tpdf-home");
      home?.scrollTo({ top: 350 });
    });

    // Verify mouse wheel / gesture scrolling works on .tpdf-home
    await page.locator(".tpdf-home").hover({ position: { x: 190, y: 300 } });
    await page.mouse.wheel(0, 200);
    await expect.poll(async () => {
      return page.evaluate(() => document.querySelector<HTMLElement>(".tpdf-home")?.scrollTop ?? 0);
    }).toBeGreaterThan(300);
  });

  test("document viewer renders properly in mobile viewport", async ({ page, request }) => {
    const upload = await request.post("/api/tpdf/documents?name=mobile-viewer-test.pdf", {
      headers: { "Content-Type": "application/pdf" },
      data: await buildPdf(),
    });
    expect(upload.status()).toBe(201);
    const document = await upload.json();

    await page.goto("/?open=" + encodeURIComponent(document.filePath));
    const viewer = page.locator("[data-tpdf-engine='pdfium-wasm']");
    await expect(viewer).toBeVisible({ timeout: 30_000 });

    const layout = await page.evaluate(() => {
      const workspace = document.querySelector<HTMLElement>(".workspace");
      const viewerArea = document.querySelector<HTMLElement>(".viewer-area");
      const statusBar = document.querySelector<HTMLElement>('[data-tpdf-region="status-bar"]');
      const mobileToolbar = document.querySelector<HTMLElement>(".tpdf-mobile-edit-toolbar");
      return {
        workspaceGridCols: workspace ? getComputedStyle(workspace).gridTemplateColumns : "",
        viewerWidth: viewerArea?.offsetWidth ?? 0,
        viewerHeight: viewerArea?.offsetHeight ?? 0,
        statusBarHeight: statusBar?.offsetHeight ?? 0,
        mobileToolbarVisible: mobileToolbar ? getComputedStyle(mobileToolbar).display !== "none" : false,
      };
    });

    expect(layout.viewerWidth).toBe(390);
    expect(layout.viewerHeight).toBeGreaterThan(600);
    expect(layout.workspaceGridCols).toBe("390px");
    expect(layout.mobileToolbarVisible).toBe(true);

    // Verify opening and closing right panel drawer on mobile
    const aiToggleBtn = page.locator("[data-tpdf-action='open-ai']");
    if (await aiToggleBtn.isVisible()) {
      await aiToggleBtn.tap();
      const backdrop = page.locator("[data-tpdf-action='right-panel-backdrop']");
      await expect(backdrop).toBeVisible();

      // Tap exposed backdrop area outside drawer on mobile
      await backdrop.tap({ position: { x: 20, y: 200 } });
      await expect(backdrop).toHaveCount(0);
      await expect(page.locator("[data-tpdf-right-sidebar='closed']")).toBeAttached();
    }
  });
});
