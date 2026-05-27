import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function run() {
  console.log("Starting Playwright browser...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Set viewport size
  await page.setViewportSize({ width: 1280, height: 900 });
  
  console.log("Navigating to Opdf Web App on http://localhost:5174...");
  await page.goto('http://localhost:5174');
  await page.waitForTimeout(2000);
  
  // Look for file input
  console.log("Looking for file input...");
  const fileInput = page.locator('input[accept="application/pdf"]').first();
  
  const pdfPath = 'c:\\mymy\\Opdf\\2605.pdf';
  console.log(`Uploading test PDF: ${pdfPath}`);
  await fileInput.setInputFiles(pdfPath);
  
  // Wait for PDF to load and render pages
  console.log("Waiting for PDF pages to render...");
  await page.waitForTimeout(8000); // 8s to ensure full rendering
  
  // Save initial screenshot
  const screenshotPath1 = 'C:\\Users\\ttha\\.gemini\\antigravity-ide\\brain\\c9b7e549-d5d1-44d5-85e2-2e4d0d832144\\stirling_mode_inactive.png';
  console.log(`Saving initial screenshot to: ${screenshotPath1}`);
  await page.screenshot({ path: screenshotPath1 });
  
  // Click to activate Stirling Edit Mode
  console.log("Activating Stirling Edit Mode...");
  const stirlingBtn = page.locator('button:has-text("Stirling Edit Mode")').first();
  const stirlingBtnExists = await stirlingBtn.isVisible();
  
  if (stirlingBtnExists) {
    await stirlingBtn.click();
    console.log("Clicked Stirling Edit Mode button successfully!");
    await page.waitForTimeout(3000); // Wait for line grouping borders to render
    
    // Save Stirling active screenshot
    const screenshotPath2 = 'C:\\Users\\ttha\\.gemini\\antigravity-ide\\brain\\c9b7e549-d5d1-44d5-85e2-2e4d0d832144\\stirling_mode_active.png';
    console.log(`Saving active Stirling Mode screenshot to: ${screenshotPath2}`);
    await page.screenshot({ path: screenshotPath2 });
    
    // Try to trigger context menu on a text block or click a line edit block
    console.log("Looking for a Stirling line edit block...");
    // Let's click the first group item
    const lineEditBlock = page.locator('div[title*="edit this text line"]').first();
    if (await lineEditBlock.isVisible()) {
      console.log("Found line edit block! Clicking it...");
      await lineEditBlock.click();
      await page.waitForTimeout(2000);
      
      // Save screenshot with modal open
      const screenshotPath3 = 'C:\\Users\\ttha\\.gemini\\antigravity-ide\\brain\\c9b7e549-d5d1-44d5-85e2-2e4d0d832144\\stirling_inline_edit_modal.png';
      console.log(`Saving inline edit modal screenshot to: ${screenshotPath3}`);
      await page.screenshot({ path: screenshotPath3 });
    } else {
      console.log("No Stirling line edit block found.");
    }
  } else {
    console.log("Stirling Edit Mode button is not visible!");
  }
  
  await browser.close();
  console.log("Browser closed successfully. Test finished!");
}

run().catch(err => {
  console.error("Test failed with error:", err);
});
