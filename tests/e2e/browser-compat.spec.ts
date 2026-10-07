import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

test("web shell and PDF viewer work in supported browsers", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your documents, ready when you are." })).toBeVisible();

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pdfPage = pdf.addPage([612, 792]);
  pdfPage.drawText("OPDF BROWSER COMPATIBILITY CHECK", {
    x: 72,
    y: 700,
    size: 18,
    font,
  });

  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name: "browser-compat.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });

  await expect(page.locator('[data-opdf-engine="pdfium-wasm"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-opdf-region="status-bar"]')).toHaveAttribute(
    "data-opdf-total-pages",
    "1",
    { timeout: 30_000 },
  );
});

test("primary web controls expose usable accessibility names", async ({ page }) => {
  await page.goto("/");
  const problems = await page.locator("button:visible").evaluateAll((buttons) =>
    buttons
      .map((button, index) => {
        const text = (button.textContent || "").trim();
        const aria = button.getAttribute("aria-label")?.trim() || "";
        const title = button.getAttribute("title")?.trim() || "";
        return text || aria || title ? null : { index, html: button.outerHTML.slice(0, 300) };
      })
      .filter(Boolean),
  );
  expect(problems).toEqual([]);

  const duplicateIds = await page.locator("[id]").evaluateAll((nodes) => {
    const counts = new Map<string, number>();
    for (const node of nodes) {
      const id = node.id;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return [...counts.entries()].filter(([, count]) => count > 1);
  });
  expect(duplicateIds).toEqual([]);

  await expect(page.locator("main, [role=main]").first()).toBeVisible();
});
