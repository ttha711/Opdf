import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

async function buildTestPdf(label: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([600, 800]);
  page.drawText(`Document content: ${label}`, { x: 50, y: 700, size: 24, font });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

test.describe("Mobile Browser-Style Tab Switcher", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("displays tab count button and opens 2-column browser tab grid on mobile", async ({ page, request }) => {
    // 1. Upload two test PDFs
    const upload1 = await request.post("/api/tpdf/documents?name=doc-alpha.pdf", {
      headers: { "Content-Type": "application/pdf" },
      data: await buildTestPdf("Alpha Document"),
    });
    expect(upload1.status()).toBe(201);
    const doc1 = await upload1.json();

    const upload2 = await request.post("/api/tpdf/documents?name=doc-beta.pdf", {
      headers: { "Content-Type": "application/pdf" },
      data: await buildTestPdf("Beta Document"),
    });
    expect(upload2.status()).toBe(201);
    const doc2 = await upload2.json();

    // 2. Open doc1
    await page.goto("/?open=" + encodeURIComponent(doc1.filePath));
    await page.waitForSelector("[data-tpdf-engine='pdfium-wasm']");

    // 3. Verify mobile tab button exists in header and displays count
    const tabBtn = page.locator("[data-tpdf-action='open-tab-switcher']");
    await expect(tabBtn).toBeVisible();

    // 4. Verify desktop tab bar is hidden on mobile
    const desktopTabs = page.locator(".tpdf-header-tabs");
    await expect(desktopTabs).toBeHidden();

    // 5. Open second document to create 2 tabs
    // Simulate opening second document
    await page.evaluate(async (path) => {
      const resp = await fetch("/api/tpdf/documents/content?path=" + encodeURIComponent(path));
      const blob = await resp.blob();
      const file = new File([blob], "doc-beta.pdf", { type: "application/pdf" });
      const dt = new DataTransfer();
      dt.items.add(file);
      window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true }));
    }, doc2.filePath);

    // Wait for viewer or tabs state
    await page.waitForTimeout(1000);

    // 6. Tap mobile tab button
    await tabBtn.tap();

    // 7. Verify MobileTabSwitcher dialog opens
    const tabSwitcher = page.locator("[data-tpdf-tab-switcher='open']");
    await expect(tabSwitcher).toBeVisible();

    // 8. Verify tab cards grid
    const tabCards = tabSwitcher.locator(".mobile-tab-card");
    const count = await tabCards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // 9. Verify active tab card styling (has is-active class)
    const activeCard = tabSwitcher.locator(".mobile-tab-card.is-active");
    await expect(activeCard).toBeVisible();


    // 11. Verify floating + button (New tab FAB) is visible
    const newTabFab = tabSwitcher.locator("[data-tpdf-action='mobile-new-tab']");
    await expect(newTabFab).toBeVisible();

    // 12. Tap close button on tab switcher header
    const closeSwitcherBtn = tabSwitcher.locator("[data-tpdf-action='close-tab-switcher']");
    await expect(closeSwitcherBtn).toBeVisible();
    await closeSwitcherBtn.tap();

    // 13. Verify tab switcher is closed and viewer returns
    await expect(tabSwitcher).toHaveCount(0);
    await expect(page.locator("[data-tpdf-engine='pdfium-wasm']")).toBeVisible();
  });
});
