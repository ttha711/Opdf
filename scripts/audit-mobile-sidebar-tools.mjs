import { chromium } from "playwright";
import { PDFDocument, rgb } from "pdf-lib";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve("docs/screenshots/mobile-audit-sidebar-tools");
mkdirSync(OUT_DIR, { recursive: true });

async function createFixturePdf() {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= 5; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Page ${i} for Tool Audit`, { x: 50, y: 700, size: 20, color: rgb(0,0,0) });
  }
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
  
  // Open fixture PDF
  const pdfBytes = await createFixturePdf();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /open pdf/i }).first().click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles({ name: "tool-audit.pdf", mimeType: "application/pdf", buffer: pdfBytes });
  await page.waitForTimeout(1000);

  const toolsToTest = [
    { id: "compress-pdf", name: "Compress PDF", search: "compress" },
    { id: "split-pdf", name: "Split PDF", search: "split" },
    { id: "watermark-pdf", name: "Watermark", search: "watermark" },
    { id: "rotate-pdf", name: "Rotate pages", search: "rotate" },
    { id: "delete-pages", name: "Delete pages", search: "delete" },
    { id: "extract-pages", name: "Extract pages", search: "extract" },
    { id: "crop-pdf", name: "Crop pages", search: "crop" },
    { id: "protect-pdf", name: "Protect PDF", search: "protect" },
    { id: "unlock-pdf", name: "Unlock PDF", search: "unlock" },
    { id: "document-health", name: "Document Health", search: "health" },
  ];

  for (const t of toolsToTest) {
    console.log(`\n=== Testing Tool Panel: ${t.name} ===`);
    await page.locator('[data-tpdf-action="search-commands"]').click();
    await page.waitForTimeout(200);
    const input = page.locator('input[aria-label="Find a command"]');
    await input.fill(t.search);
    await page.waitForTimeout(200);
    const cmd = page.locator('#tpdf-command-results button:not([disabled])').first();
    if (await cmd.isVisible()) {
      await cmd.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT_DIR}/${t.id}.png` });

      const panel = page.locator('.acrobat-tool-panel, [data-tpdf-panel="tool"]').first();
      if (await panel.isVisible()) {
        const box = await panel.boundingBox();
        console.log(`  [OK] ${t.name} panel visible: ${Math.round(box?.width)}x${Math.round(box?.height)}px at x=${box?.x}, y=${box?.y}`);

        // Check close button
        const closeBtn = panel.locator('[data-tpdf-action="close-tool"], button[title="Close tool"]').first();
        if (await closeBtn.isVisible()) {
          const cBox = await closeBtn.boundingBox();
          console.log(`  Close tool button: ${Math.round(cBox?.width)}x${Math.round(cBox?.height)}px`);
          if (cBox && (cBox.width < 36 || cBox.height < 36)) {
            console.log(`  [WARN] Close button touch target too small!`);
          }
        }

        // Check disclaimer box and primary buttons
        const disclaimer = panel.locator(".absolute.bottom-6");
        if (await disclaimer.isVisible()) {
          const dBox = await disclaimer.boundingBox();
          console.log(`  Disclaimer bounding box:`, dBox);

          // Check if any primary button inside panel overlaps with disclaimer
          const actionBtns = await panel.locator("button.btn-primary, button[type='submit'], button.bg-\\[var\\(--acrobat-blue\\)\\], button.bg-blue-600").all();
          for (const btn of actionBtns) {
            const bBox = await btn.boundingBox();
            const btnText = (await btn.textContent())?.trim();
            if (bBox && dBox) {
              const overlap = !(bBox.x + bBox.width < dBox.x || bBox.x > dBox.x + dBox.width || bBox.y + bBox.height < dBox.y || bBox.y > dBox.y + dBox.height);
              if (overlap) {
                console.log(`  [COLLISION DETECTED] Button "${btnText}" overlaps with disclaimer!`);
              }
            }
          }
        }

        // Close tool panel
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
        } else {
          // Collapse button
          const collapse = page.locator(".tpdf-panel-collapse");
          if (await collapse.isVisible()) await collapse.click();
        }
        await page.waitForTimeout(300);
      } else {
        console.log(`  [FAIL] ${t.name} panel NOT visible!`);
      }
    } else {
      console.log(`  [FAIL] Command not found for "${t.search}"`);
      await page.keyboard.press("Escape");
    }
  }

  await browser.close();
}

audit().catch(console.error);
