import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

async function createMobilePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`MOBILE PAGE ${pageNumber}`, { x: 72, y: 760, size: 24, font });
  }
  return Buffer.from(await pdf.save());
}

test("mobile Home, menu and Pages drawer remain usable by touch", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Your documents, ready when you are." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open PDF", exact: true })).toBeVisible();
  await expect(page.getByText("Opdf Power Tools Dashboard")).toHaveCount(0);

  const mobileMenu = page.locator("header").getByRole("button", { name: "☰", exact: true });
  await expect(mobileMenu).toBeVisible();
  await expect(page.locator("header").getByRole("button", { name: "File", exact: true })).toBeHidden();

  const primary = page.getByRole("button", { name: "Open PDF", exact: true });
  const primaryBox = await primary.boundingBox();
  expect(primaryBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const pdf = await createMobilePdf();
  const input = page.locator('input[type="file"][accept="application/pdf"]').first();
  await input.setInputFiles({
    name: "mobile-three-pages.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });

  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("page-status")).toContainText(/Page\s+1\s+of\s+3/i, { timeout: 30_000 });

  const viewer = page.locator(".viewer-shell");
  const pagesButton = viewer.getByRole("button", { name: /sidebar/i }).first();
  await expect(pagesButton).toBeVisible();
  const pagesButtonBox = await pagesButton.boundingBox();
  expect(pagesButtonBox?.height ?? 0).toBeGreaterThanOrEqual(40);

  const firstThumbnailBox = () =>
    viewer.locator("img, canvas").evaluateAll((surfaces) => {
      for (const surface of surfaces) {
        const rect = surface.getBoundingClientRect();
        const visible =
          rect.width >= 48 &&
          rect.width <= 240 &&
          rect.height >= 64 &&
          rect.height <= 340 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth;
        if (visible) return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }
      return null;
    });

  await pagesButton.click();
  await expect.poll(firstThumbnailBox, { timeout: 10_000 }).not.toBeNull();
  const firstPageBox = await firstThumbnailBox();
  const viewport = page.viewportSize();
  expect(firstPageBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((firstPageBox?.x ?? 0) + (firstPageBox?.width ?? Infinity)).toBeLessThanOrEqual(viewport?.width ?? 412);

  await pagesButton.click();
  await expect.poll(firstThumbnailBox, { timeout: 10_000 }).toBeNull();

  await mobileMenu.click();
  await expect(page.locator("header").getByRole("menuitem", { name: "Fit Page", exact: true })).toBeEnabled();
  await page.locator("header").getByRole("menuitem", { name: "Fit Page", exact: true }).click();
  await expect(page.locator("header").getByRole("menu")).toHaveCount(0);
});
