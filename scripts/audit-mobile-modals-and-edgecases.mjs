import { chromium } from "playwright";
import { PDFDocument, rgb } from "pdf-lib";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve("docs/screenshots/mobile-audit-modals");
mkdirSync(OUT_DIR, { recursive: true });

async function createFixturePdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawText("TPDF Modal Audit PDF", { x: 50, y: 700, size: 20, color: rgb(0,0,0) });
  return Buffer.from(await doc.save());
}

async function audit() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  await page.goto("http://127.0.0.1:8787", { waitUntil: "networkidle" });
  
  // 1. Check Mobile Tab Count on Home before opening doc (should be 0)
  const homeTabBadge = await page.locator(".tpdf-mobile-tab-count").textContent();
  console.log("Tab count badge on Home (expected 0):", homeTabBadge);

  // 2. Open fixture PDF
  const pdfBytes = await createFixturePdf();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /open pdf/i }).first().click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles({ name: "test.pdf", mimeType: "application/pdf", buffer: pdfBytes });
  await page.waitForTimeout(1000);

  // 3. Check Mobile Tab Count with doc open (should be 1)
  const docTabBadge = await page.locator(".tpdf-mobile-tab-count").textContent();
  console.log("Tab count badge with doc loaded (expected 1):", docTabBadge);

  // 4. Check Mobile Menu backdrop
  console.log("--- Checking Mobile Menu Backdrop ---");
  await page.locator(".tpdf-mobile-menu button").first().click();
  await page.waitForTimeout(400);
  const backdrop = page.locator(".tpdf-app-header .fixed.inset-0");
  console.log("Backdrop visible:", await backdrop.isVisible());
  if (await backdrop.isVisible()) {
    // Click backdrop to dismiss
    await backdrop.click();
    await page.waitForTimeout(300);
    console.log("Menu dismissed via backdrop click. Menu surface visible:", await page.locator(".tpdf-menu-surface--mobile").isVisible());
  }

  // Helper to test modal opening via search
  async function testModal(query, modalName, filename) {
    console.log(`\n=== Opening ${modalName} via search: "${query}" ===`);
    await page.locator('[data-tpdf-action="search-commands"]').click();
    await page.waitForTimeout(300);
    const input = page.locator('input[aria-label="Find a command"]');
    await input.fill(query);
    await page.waitForTimeout(300);
    const opt = page.locator('#tpdf-command-results button:not([disabled])').first();
    if (await opt.isVisible()) {
      const title = (await opt.textContent())?.trim();
      console.log("  Clicking command:", title);
      await opt.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT_DIR}/${filename}.png` });

      const dialog = page.locator("[role='dialog'], [data-tpdf-dialog], .tpdf-modal").first();
      if (await dialog.isVisible()) {
        const box = await dialog.boundingBox();
        console.log(`  [SUCCESS] ${modalName} visible! Box:`, box);
        // Find close button
        const closeBtn = dialog.locator('button[data-tpdf-action="close-dialog"], button[aria-label*="Close" i], button:has-text("Close"), button:has-text("Cancel")').first();
        if (await closeBtn.isVisible()) {
          const cBox = await closeBtn.boundingBox();
          console.log(`  Close button: ${Math.round(cBox?.width)}x${Math.round(cBox?.height)}px`);
          await closeBtn.click();
        } else {
          await page.keyboard.press("Escape");
        }
      } else {
        console.log(`  [FAIL] ${modalName} dialog not visible!`);
      }
    } else {
      console.log(`  [FAIL] Command not found for "${query}"`);
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(400);
  }

  await testModal("compare", "Revision Compare", "02-revision-compare");
  await testModal("digital signature", "Digital Signature", "04-digital-sign");
  await testModal("advanced", "Advanced PDF", "05-advanced-pdf");

  // 5. Test Measurement tool close button touch target
  console.log("\n=== Testing Measurement Tool ===");
  await page.locator('[data-tpdf-action="search-commands"]').click();
  await page.waitForTimeout(200);
  await page.locator('input[aria-label="Find a command"]').fill("drawing layers and cad");
  await page.locator('#tpdf-command-results button:not([disabled])').first().click();
  await page.waitForTimeout(500);

  await browser.close();
}

audit().catch(console.error);
