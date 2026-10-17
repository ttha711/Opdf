import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

async function buildTestPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([600, 800]);
    page.drawText(`Page ${i} content for mobile tool testing`, { x: 50, y: 700, size: 20, font });
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

test.describe("Mobile Tools & Buttons Audit", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("1. Home Screen tools and navigation on mobile", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".tpdf-home");

    // All Tools dashboard button
    const allToolsBtn = page.getByRole("button", { name: /All tools/i });
    await expect(allToolsBtn).toBeVisible();
    await allToolsBtn.tap();

    // Verify AllToolsDashboard opened and has scrollable categories
    const dashboard = page.locator(".all-tools-dashboard");
    await expect(dashboard).toBeVisible();
    const dashboardMetrics = await page.evaluate(() => {
      const db = document.querySelector<HTMLElement>(".all-tools-dashboard");
      return {
        scrollHeight: db?.scrollHeight ?? 0,
        clientHeight: db?.clientHeight ?? 0,
        overflowY: db ? getComputedStyle(db).overflowY : "",
      };
    });
    expect(dashboardMetrics.scrollHeight).toBeGreaterThan(dashboardMetrics.clientHeight);
    expect(dashboardMetrics.overflowY).toBe("auto");

    // Close or navigate back to Home
    const closeToolsBtn = page.locator(".all-tools-dashboard button").first();
    await closeToolsBtn.tap();
    await expect(page.locator(".tpdf-home")).toBeVisible();

    // Tap Quick Tool: Compress PDF
    const compressToolCard = page.locator(".tpdf-home__tool-card", { hasText: "Compress PDF" });
    await expect(compressToolCard).toBeVisible();
    await compressToolCard.tap();

    // Verify IntegratedUploadWorkspace renders for compress-pdf
    await expect(page.locator(".upload-workspace")).toBeVisible();
    await expect(page.locator(".upload-workspace h3")).toContainText("Compress");

    // Return to Home via brand home button
    const brandHome = page.locator(".tpdf-brand-home");
    await expect(brandHome).toBeVisible();
    await brandHome.tap();
    await expect(page.locator(".tpdf-home")).toBeVisible();
  });

  test("2. Document Viewer Mobile Toolbar & Navigation", async ({ page, request }) => {
    const upload = await request.post("/api/tpdf/documents?name=mobile-audit.pdf", {
      headers: { "Content-Type": "application/pdf" },
      data: await buildTestPdf(),
    });
    expect(upload.status()).toBe(201);
    const document = await upload.json();

    await page.goto("/?open=" + encodeURIComponent(document.filePath));
    const viewer = page.locator("[data-tpdf-engine='pdfium-wasm']");
    await expect(viewer).toBeVisible({ timeout: 30_000 });

    // 2.1 Mobile Edit Toolbar
    const mobileToolbar = page.locator(".tpdf-mobile-edit-toolbar");
    await expect(mobileToolbar).toBeVisible();

    const quickTools = mobileToolbar.locator(".viewer-quick-tool");
    const count = await quickTools.count();
    expect(count).toBeGreaterThan(0);

    // Tap first markup tool (e.g. highlight)
    await quickTools.first().tap();

    // Tap Hand/Select tool to return to pan mode
    const selectPanBtn = page.locator("[data-tpdf-action='mobile-select']");
    await expect(selectPanBtn).toBeVisible();
    await selectPanBtn.tap();
    await expect(selectPanBtn).toHaveAttribute("aria-pressed", "true");

    // 2.2 Mobile Status Bar
    const statusBar = page.locator('[data-tpdf-region="status-bar"]');
    await expect(statusBar).toBeVisible();
    await expect(statusBar).toContainText(/Page 1/i);

    const nextPageBtn = statusBar.locator("button[title*='Next']");
    if (await nextPageBtn.isVisible()) {
      await nextPageBtn.tap();
      await expect(statusBar).toContainText(/Page 2/i);
    }
  });

  test("3. Mobile Page Filmstrip (▣ Pages) workflow", async ({ page, request }) => {
    const upload = await request.post("/api/tpdf/documents?name=mobile-filmstrip.pdf", {
      headers: { "Content-Type": "application/pdf" },
      data: await buildTestPdf(),
    });
    expect(upload.status()).toBe(201);
    const document = await upload.json();

    await page.goto("/?open=" + encodeURIComponent(document.filePath));
    await page.waitForSelector("[data-tpdf-engine='pdfium-wasm']");

    // Open Mobile Page Filmstrip
    const filmstripBtn = page.locator("[data-tpdf-action='toggle-page-filmstrip']");
    await expect(filmstripBtn).toBeVisible();
    await filmstripBtn.tap();

    // Check filmstrip drawer is visible at bottom
    const filmstrip = page.locator(".tpdf-mobile-filmstrip");
    await expect(filmstrip).toBeVisible();

    // Close filmstrip
    await filmstripBtn.tap();
    await expect(filmstrip).toHaveCount(0);
  });

  test("4. AI Assistant Drawer on mobile", async ({ page, request }) => {
    const upload = await request.post("/api/tpdf/documents?name=mobile-ai.pdf", {
      headers: { "Content-Type": "application/pdf" },
      data: await buildTestPdf(),
    });
    expect(upload.status()).toBe(201);
    const document = await upload.json();

    await page.goto("/?open=" + encodeURIComponent(document.filePath));
    await page.waitForSelector("[data-tpdf-engine='pdfium-wasm']");

    const aiToggleBtn = page.locator("[data-tpdf-action='open-ai']");
    await expect(aiToggleBtn).toBeVisible();
    await aiToggleBtn.tap();

    const rightSidebar = page.locator("[data-tpdf-right-sidebar='open']");
    await expect(rightSidebar).toBeVisible();
    const backdrop = page.locator("[data-tpdf-action='right-panel-backdrop']");
    await expect(backdrop).toBeVisible();

    // AI Chat input field
    const aiInput = page.locator("[data-tpdf-ai-input]");
    await expect(aiInput).toBeVisible();

    // Close drawer via collapse button
    const collapseBtn = page.locator("[data-tpdf-action='collapse-right-panel']");
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.tap();
    await expect(page.locator("[data-tpdf-right-sidebar='closed']")).toBeAttached();
  });

  test("5. Mobile Menu & Tool Modals touch audit", async ({ page, request }) => {
    const upload = await request.post("/api/tpdf/documents?name=mobile-modals.pdf", {
      headers: { "Content-Type": "application/pdf" },
      data: await buildTestPdf(),
    });
    expect(upload.status()).toBe(201);
    const document = await upload.json();

    await page.goto("/?open=" + encodeURIComponent(document.filePath));
    await page.waitForSelector("[data-tpdf-engine='pdfium-wasm']");

    // Open mobile menu
    const menuTrigger = page.locator(".tpdf-mobile-menu .tpdf-menu-trigger");
    await expect(menuTrigger).toBeVisible();
    await menuTrigger.tap();

    // Open 'Tools' submenu
    const toolsSubmenu = page.locator("[data-tpdf-menu-item='Tools']");
    await expect(toolsSubmenu).toBeVisible();
    await toolsSubmenu.tap();

    // Open 'Pages' submenu
    const pagesSubmenu = page.locator("[data-tpdf-menu-item='Pages']");
    await expect(pagesSubmenu).toBeVisible();
    await pagesSubmenu.tap();

    // Click 'Insert PDF...' action
    const insertAction = page.locator("[data-tpdf-menu-item='Insert PDF...']");
    await expect(insertAction).toBeVisible();
    await insertAction.tap();

    // Verify Insert PDF Modal opened
    const insertModal = page.locator("[data-tpdf-dialog='insert-pdf'] .premium-modal");
    await expect(insertModal).toBeVisible();

    // Check close button has touch size >= 40px
    const closeBtn = insertModal.locator(".premium-modal-close");
    const closeBox = await closeBtn.boundingBox();
    expect(closeBox?.width).toBeGreaterThanOrEqual(40);
    expect(closeBox?.height).toBeGreaterThanOrEqual(40);

    // Close modal
    await closeBtn.tap();
    await expect(insertModal).toHaveCount(0);

    // Open mobile menu again and open 'Tools' -> 'Pages' -> 'Split PDF...'
    await menuTrigger.tap();
    await page.locator("[data-tpdf-menu-item='Tools']").tap();
    await page.locator("[data-tpdf-menu-item='Pages']").tap();
    await page.locator("[data-tpdf-menu-item='Split PDF...']").tap();

    // Check sidebar tool panel opened
    const sidebarPanel = page.locator(".acrobat-tool-panel");
    await expect(sidebarPanel).toBeVisible();

    // Open mobile menu and open 'Tools' -> 'Security' -> 'Search & Secure Redact...' modal
    await menuTrigger.tap();
    await page.locator("[data-tpdf-menu-item='Tools']").tap();
    await page.locator("[data-tpdf-menu-item='Security']").tap();
    await page.locator("[data-tpdf-menu-item='Search & Secure Redact...']").tap();

    const redactModal = page.locator("[data-tpdf-dialog='search-redact'] .premium-modal");
    await expect(redactModal).toBeVisible();

    const redactClose = redactModal.locator("button[aria-label='Close dialog']");
    const redactCloseBox = await redactClose.boundingBox();
    expect(redactCloseBox?.width).toBeGreaterThanOrEqual(40);
    expect(redactCloseBox?.height).toBeGreaterThanOrEqual(40);

    const cancelBtn = redactModal.locator(".premium-modal-footer button", { hasText: "Cancel" });
    const cancelBox = await cancelBtn.boundingBox();
    expect(cancelBox?.height).toBeGreaterThanOrEqual(40);

    await redactClose.tap();
    await expect(redactModal).toHaveCount(0);
  });

  test("6. Command Palette search & touch dismiss on mobile", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".tpdf-home");

    // Trigger palette via search button in mobile header
    const searchCommandsBtn = page.locator("[data-tpdf-action='search-commands']");
    await expect(searchCommandsBtn).toBeVisible();
    await searchCommandsBtn.tap();

    // Check palette is open
    const palette = page.locator("[data-tpdf-command-palette='open']");
    await expect(palette).toBeVisible();

    // Check search input
    const searchInput = palette.locator("input[aria-label='Find a command']");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("merge");

    // Verify results
    const results = palette.locator("#tpdf-command-results button");
    expect(await results.count()).toBeGreaterThan(0);

    // Dismiss palette via close button (has ✕ icon and touch size >= 40px)
    const escBtn = palette.locator("button[aria-label='Close command search']");
    await expect(escBtn).toBeVisible();
    const escBox = await escBtn.boundingBox();
    expect(escBox?.width).toBeGreaterThanOrEqual(40);
    expect(escBox?.height).toBeGreaterThanOrEqual(40);

    await escBtn.tap();
    await expect(palette).toHaveCount(0);
  });
});
