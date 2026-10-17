import { chromium } from "playwright";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve("docs/screenshots/mobile-audit-deep");
mkdirSync(OUT_DIR, { recursive: true });

async function createFixturePdf() {
  const doc = await PDFDocument.create();
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`TPDF UX Audit Document`, { x: 50, y: 780, size: 22, font: fontBold, color: rgb(0.08, 0.35, 0.75) });
    page.drawText(`Page ${i} of 3 — Interactive Tool Evaluation`, { x: 50, y: 745, size: 13, font, color: rgb(0.3, 0.3, 0.3) });
    page.drawRectangle({
      x: 50, y: 520, width: 495, height: 200,
      borderColor: rgb(0.7, 0.8, 0.95), borderWidth: 1.5, color: rgb(0.96, 0.98, 1.0),
    });
    page.drawText(`Test section ${i}: Verifying Mobile Touch & Tool Ergonomics`, { x: 70, y: 680, size: 13, font: fontBold, color: rgb(0.1, 0.2, 0.4) });
    page.drawText("1. Are buttons sized >= 44x44px for thumb touch?", { x: 70, y: 650, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("2. Are common tools accessible without deep nested navigation?", { x: 70, y: 630, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("3. Do floating action buttons collide with content or status bars?", { x: 70, y: 610, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("4. Does the canvas retain sufficient viewing space on 390px phones?", { x: 70, y: 590, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(`Generated: ${new Date().toISOString()}`, { x: 70, y: 540, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  }
  return Buffer.from(await doc.save());
}

async function runDeepAudit() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14/15 standard viewport
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const pdfBytes = await createFixturePdf();

  const auditLog = [];
  function log(category, title, detail) {
    auditLog.push({ category, title, detail, time: new Date().toISOString() });
    console.log(`[${category}] ${title}: ${detail}`);
  }

  // 1. HOME SCREEN AUDIT
  console.log("=== 1. AUDITING HOME SCREEN ===");
  await page.goto("http://127.0.0.1:8787", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT_DIR}/01-home-initial.png` });

  // Check top bar buttons on home
  const topButtons = await page.locator(".tpdf-topbar button").evaluateAll((btns) =>
    btns.map((b) => ({
      ariaLabel: b.getAttribute("aria-label") || b.title || b.textContent?.trim(),
      action: b.getAttribute("data-tpdf-action"),
      rect: b.getBoundingClientRect(),
    }))
  );
  log("HOME", "Top bar buttons", JSON.stringify(topButtons));

  // Check Floating Action Button on home
  const fab = page.locator(".ai-float-toggle-btn");
  if (await fab.isVisible()) {
    const fabBox = await fab.boundingBox();
    log("HOME", "AI Floating Button", `Visible at x=${fabBox?.x}, y=${fabBox?.y}, size=${fabBox?.width}x${fabBox?.height}`);
  }

  // Check Quick Actions on Home
  const quickActions = await page.locator(".tpdf-home__action-list button").evaluateAll((btns) =>
    btns.map((b) => ({ label: b.textContent?.trim(), visible: b.getBoundingClientRect().height > 0 }))
  );
  log("HOME", "Quick actions list", JSON.stringify(quickActions));

  // Test opening All Tools from Home
  const allToolsBtn = page.getByRole("button", { name: /all tools/i }).first();
  if (await allToolsBtn.isVisible()) {
    await allToolsBtn.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT_DIR}/02-home-scrolled-quick-actions.png` });
    await allToolsBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT_DIR}/03-all-tools-dashboard.png` });

    // Test tabs in All Tools
    const tabs = page.locator(".all-tools-dashboard div.border-b button");
    const tabCount = await tabs.count();
    log("ALL_TOOLS", "Tabs count", `${tabCount}`);
    for (let i = 0; i < tabCount; i++) {
      const tabText = await tabs.nth(i).textContent();
      await tabs.nth(i).click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT_DIR}/03-all-tools-tab-${i}.png` });
      log("ALL_TOOLS", `Tab ${i}`, tabText?.trim() || "");
    }

    // Close tools dashboard
    const closeTools = page.getByRole("button", { name: /close tools/i });
    if (await closeTools.isVisible()) await closeTools.click();
    await page.waitForTimeout(400);
  }

  // 2. OPEN DOCUMENT AUDIT
  console.log("=== 2. AUDITING DOCUMENT VIEWER ===");
  const picker = page.locator('input[type="file"][accept*="pdf"]').first();
  await picker.setInputFiles({ name: "UX_Deep_Audit.pdf", mimeType: "application/pdf", buffer: pdfBytes });
  await page.waitForSelector('[data-tpdf-region="status-bar"][data-tpdf-has-document="true"]', { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT_DIR}/04-viewer-document-loaded.png` });

  // 3. AUDIT HEADER & APP MENU
  console.log("=== 3. AUDITING APPLICATION MENU ===");
  const appMenuTrigger = page.locator(".tpdf-mobile-menu button, .tpdf-topbar .tpdf-menu-trigger").first();
  if (await appMenuTrigger.isVisible()) {
    await appMenuTrigger.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT_DIR}/05-app-menu-sheet.png` });

    // Audit menu items
    const menuItems = await page.locator(".menu-dropdown-item, .mobile-sheet-item, button").evaluateAll((elements) =>
      elements.filter((el) => el.closest(".menu-dropdown-list, .mobile-menu-sheet")).map((el) => el.textContent?.trim())
    );
    log("APP_MENU", "Menu items in mobile sheet", JSON.stringify(menuItems));

    // Click Document submenu if available
    const docItem = page.getByRole("button", { name: /^Document/i }).first();
    if (await docItem.isVisible()) {
      await docItem.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT_DIR}/05-app-menu-document-sub.png` });
    }

    // Dismiss menu
    await page.keyboard.press("Escape").catch(() => {});
    const backdrop = page.locator(".mobile-menu-backdrop");
    if (await backdrop.isVisible()) await backdrop.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }

  // 4. AUDIT COMMAND PALETTE
  console.log("=== 4. AUDITING COMMAND PALETTE ===");
  const searchBtn = page.locator('[data-tpdf-action="search-commands"]');
  if (await searchBtn.isVisible()) {
    await searchBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT_DIR}/06-command-palette.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }

  // 5. AUDIT TAB SWITCHER
  console.log("=== 5. AUDITING TAB SWITCHER ===");
  const tabBtn = page.locator('[data-tpdf-action="open-tab-switcher"]');
  if (await tabBtn.isVisible()) {
    await tabBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT_DIR}/07-tab-switcher.png` });

    // Check close tab button icon & bounding box
    const cardCloseBtn = page.locator('[data-tpdf-action="close-tab-card"]').first();
    const hasCloseBtn = await cardCloseBtn.isVisible();
    const closeBtnSvg = await cardCloseBtn.locator("svg").innerHTML().catch(() => "");
    log("TAB_SWITCHER", "Close button svg innerHTML", closeBtnSvg ? closeBtnSvg.slice(0, 50) : "EMPTY");

    // Close switcher
    const switcherClose = page.locator('[data-tpdf-action="close-tab-switcher"]');
    if (await switcherClose.isVisible()) await switcherClose.click();
    await page.waitForTimeout(400);
  }

  // 6. AUDIT QUICK TOOLS & TOOLBAR INTERACTIONS
  console.log("=== 6. AUDITING TOOLBAR BUTTONS ===");
  const quickToolBtns = page.locator(".viewer-quick-tool");
  const count = await quickToolBtns.count();
  log("QUICK_TOOLS", "Quick tools count", `${count}`);

  for (let i = 0; i < count; i++) {
    const btn = quickToolBtns.nth(i);
    const label = (await btn.getAttribute("aria-label")) || (await btn.getAttribute("title")) || `tool-${i}`;
    await btn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT_DIR}/08-tool-${i}-${label.toLowerCase().replace(/\s+/g, "_")}.png` });
    log("QUICK_TOOLS", `Activated tool ${label}`, `Active class: ${await btn.getAttribute("class")}`);
  }

  // Reset to select tool
  const selectBtn = page.locator('[data-tpdf-action="mobile-select"]');
  if (await selectBtn.isVisible()) await selectBtn.click();
  await page.waitForTimeout(400);

  // 7. AUDIT PAGE FILMSTRIP DRAWER
  console.log("=== 7. AUDITING FILMSTRIP DRAWER ===");
  const filmstripBtn = page.locator('[data-tpdf-action="toggle-page-filmstrip"]');
  if (await filmstripBtn.isVisible()) {
    await filmstripBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT_DIR}/09-filmstrip-drawer.png` });

    // Test clicking page 2 thumbnail
    const thumb2 = page.locator(".tpdf-mobile-filmstrip__item").nth(1);
    if (await thumb2.isVisible()) {
      await thumb2.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT_DIR}/09-filmstrip-page2-selected.png` });
    }

    // Close filmstrip
    const closeFilmstrip = page.locator(".tpdf-mobile-filmstrip__header button").last();
    if (await closeFilmstrip.isVisible()) await closeFilmstrip.click();
    await page.waitForTimeout(400);
  }

  // 8. AUDIT RIGHT PANEL TOOLS
  console.log("=== 8. AUDITING RIGHT PANEL TOOLS ===");
  const expandRightBtn = page.locator('[data-tpdf-action="expand-right-panel"]');
  if (await expandRightBtn.isVisible()) {
    await expandRightBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT_DIR}/10-right-panel-tools.png` });

    // Check collapse button positioning
    const collapseBtn = page.locator('[data-tpdf-action="collapse-right-panel"]');
    const collapseBox = await collapseBtn.boundingBox();
    log("RIGHT_PANEL", "Collapse button bounding box", JSON.stringify(collapseBox));

    // Test clicking OCR quick tool
    const ocrBtn = page.locator('.right-info-panel button:has-text("OCR"), [data-tpdf-tool="ocr"]').first();
    if (await ocrBtn.isVisible()) {
      log("RIGHT_PANEL", "OCR button visible", "true");
    }

    // Collapse right panel
    if (await collapseBtn.isVisible()) await collapseBtn.click();
    await page.waitForTimeout(400);
  }

  // 9. AUDIT AI ASSISTANT PANEL
  console.log("=== 9. AUDITING AI ASSISTANT PANEL ===");
  if (await fab.isVisible()) {
    await fab.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT_DIR}/11-ai-assistant-docked.png` });

    // Test input interaction
    const aiInput = page.locator(".ai-chat-input input, textarea, [placeholder*='machine agent']").first();
    if (await aiInput.isVisible()) {
      await aiInput.fill("Help me analyze page 1");
      await page.screenshot({ path: `${OUT_DIR}/11-ai-assistant-typed.png` });
    }

    const closeAi = page.locator('[data-tpdf-action="collapse-right-panel"], .ai-panel-close-btn').first();
    if (await closeAi.isVisible()) await closeAi.click();
    await page.waitForTimeout(400);
  }

  // 10. MEASURE CANVAS VIEWPORT ON MOBILE
  const canvasArea = page.locator(".viewer-area");
  const canvasBox = await canvasArea.boundingBox();
  log("CANVAS", "Usable PDF canvas bounding box", JSON.stringify(canvasBox));

  await browser.close();
  console.log("=== AUDIT COMPLETE ===");
  console.log(JSON.stringify(auditLog, null, 2));
}

runDeepAudit().catch((err) => {
  console.error("Deep audit failed:", err);
  process.exit(1);
});
