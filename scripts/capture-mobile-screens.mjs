import { chromium } from "playwright";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve("docs/screenshots/mobile-audit");
mkdirSync(OUT_DIR, { recursive: true });

async function createTestPdf(title, subtitle) {
  const doc = await PDFDocument.create();
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(title, { x: 50, y: 780, size: 20, font: fontBold, color: rgb(0.1, 0.38, 0.78) });
    page.drawText(`${subtitle} — Page ${i} of 3`, { x: 50, y: 750, size: 13, font, color: rgb(0.35, 0.35, 0.35) });
    page.drawRectangle({
      x: 50, y: 540, width: 495, height: 180,
      borderColor: rgb(0.75, 0.82, 0.95), borderWidth: 1.5, color: rgb(0.96, 0.98, 1.0),
    });
    page.drawText(`TPDF Mobile Walkthrough Test Document (Page ${i})`, { x: 70, y: 680, size: 14, font: fontBold, color: rgb(0.1, 0.2, 0.4) });
    page.drawText("Testing mobile ergonomics, 2-column browser tab switcher, quick tools,", { x: 70, y: 645, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("responsive touch controls, bottom status bar, and dialog overlays.", { x: 70, y: 625, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(`Generated: ${new Date().toISOString()}`, { x: 70, y: 580, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  }
  return Buffer.from(await doc.save());
}

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const pdf1 = await createTestPdf("TPDF Financial Report 2026", "Quarterly Statement");
  const pdf2 = await createTestPdf("Architecture Proposal v2", "Engineering RFC");

  console.log("1. Mobile Home...");
  await page.goto("http://127.0.0.1:8787", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT_DIR}/01-mobile-home.png` });

  console.log("2. Mobile All Tools Dashboard...");
  const toolsBtn = page.locator("button.tpdf-home__secondary");
  if (await toolsBtn.isVisible()) {
    await toolsBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT_DIR}/02-mobile-all-tools.png` });
    const homeBrand = page.locator('[data-tpdf-action="home"]');
    if (await homeBrand.isVisible()) await homeBrand.click();
    await page.waitForTimeout(400);
  }

  console.log("3. Uploading first PDF fixture...");
  await page.goto("http://127.0.0.1:8787", { waitUntil: "networkidle" });
  const picker = page.locator('input[type="file"][accept*="pdf"]').first();
  await picker.setInputFiles({ name: "Financial_Report_2026.pdf", mimeType: "application/pdf", buffer: pdf1 });
  await page.waitForSelector('[data-tpdf-region="status-bar"][data-tpdf-has-document="true"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT_DIR}/03-mobile-pdf-viewer.png` });

  console.log("4. Toggling Page Filmstrip drawer...");
  const filmstripBtn = page.locator('[data-tpdf-action="toggle-page-filmstrip"]');
  if (await filmstripBtn.isVisible()) {
    await filmstripBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT_DIR}/04-mobile-page-filmstrip.png` });
    await filmstripBtn.click();
    await page.waitForTimeout(500);
  }

  console.log("5. Opening Mobile Tab Switcher (Single Tab)...");
  const tabBtn = page.locator('[data-tpdf-action="open-tab-switcher"]');
  await tabBtn.click();
  await page.waitForSelector('[data-tpdf-tab-switcher="open"]', { timeout: 5000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT_DIR}/05-mobile-tab-switcher-single.png` });

  console.log("6. Adding second PDF tab and viewing 2-column grid...");
  const closeTabSwitcher = page.locator('[data-tpdf-action="close-tab-switcher"]');
  await closeTabSwitcher.click();
  await page.waitForTimeout(400);

  await picker.setInputFiles({ name: "Architecture_Proposal_v2.pdf", mimeType: "application/pdf", buffer: pdf2 });
  await page.waitForTimeout(1500);

  await tabBtn.click();
  await page.waitForSelector('[data-tpdf-tab-switcher="open"]', { timeout: 5000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT_DIR}/06-mobile-tab-switcher-two-tabs.png` });
  await closeTabSwitcher.click();
  await page.waitForTimeout(500);

  console.log("7. Mobile Application Menu...");
  const appMenuBtn = page.getByRole("button", { name: /application menu/i }).first();
  if (await appMenuBtn.isVisible()) {
    await appMenuBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT_DIR}/07-mobile-application-menu.png` });
    await appMenuBtn.click().catch(() => {});
    await page.waitForTimeout(400);
  }

  console.log("8. Command Palette on mobile...");
  const searchBtn = page.locator('[data-tpdf-action="search-commands"]');
  if (await searchBtn.isVisible()) {
    await searchBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT_DIR}/08-mobile-command-palette.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }

  console.log("9. Document Tools Right Panel...");
  const expandRightBtn = page.locator('[data-tpdf-action="expand-right-panel"]');
  if (await expandRightBtn.isVisible()) {
    await expandRightBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT_DIR}/09-mobile-right-panel-tools.png` });
    const collapseBtn = page.locator('[data-tpdf-action="collapse-right-panel"]');
    if (await collapseBtn.isVisible()) await collapseBtn.click();
    await page.waitForTimeout(400);
  }

  console.log("10. AI Assistant Panel on mobile...");
  await page.evaluate(() => {
    const aiBtn = document.querySelector('[data-tpdf-action="open-ai"]');
    if (aiBtn) (/** @type {HTMLElement} */ (aiBtn)).click();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT_DIR}/10-mobile-ai-assistant.png` });
  const collapseAiBtn = page.locator('[data-tpdf-action="collapse-right-panel"]');
  if (await collapseAiBtn.isVisible()) await collapseAiBtn.click();
  await page.waitForTimeout(400);

  console.log("11. Dark Mode on mobile...");
  await page.evaluate(() => document.documentElement.classList.toggle("dark", true));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT_DIR}/11-mobile-dark-mode.png` });
  await page.evaluate(() => document.documentElement.classList.toggle("dark", false));

  await browser.close();
  console.log(`Success! All screenshots saved to: ${OUT_DIR}`);
}

capture().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
