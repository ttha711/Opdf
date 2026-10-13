import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { addPdfBookmarks } from "../../apps/web/src/lib/pdfAdvanced";
import { clickApplicationMenuItem } from "../helpers/app-menu";

test("opens an existing Unicode/nested PDF outline without erasing bookmarks", async ({ page }) => {
  test.setTimeout(75_000);
  await page.goto("/");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    pdf.addPage([612,792]).drawText(`BOOKMARK SHEET ${i}`, {x:72,y:700,font,size:18});
  }
  const source = await addPdfBookmarks(await pdf.save(), [
    {title:"Bản vẽ kiến trúc",page:1},
    {title:"Cấu tạo móng",page:2,parent:0},
    {title:"Mặt đứng",page:3},
  ]);
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name:"bookmarked-drawing.pdf", mimeType:"application/pdf", buffer:Buffer.from(source),
  });
  await expect(page.locator('[data-tpdf-engine="pdfium-wasm"]')).toBeVisible({timeout:20000});
  await clickApplicationMenuItem(page, "Advanced PDF...");
  const dialog = page.locator('[data-tpdf-dialog="advanced-pdf"]');
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", {name:/^bookmarks$/i}).click();
  const search = dialog.getByRole("searchbox", {name:"Search bookmarks"});
  await expect(search).toBeVisible();
  await expect(dialog.locator("[data-tpdf-bookmark-index]")).toHaveCount(3, {timeout:15000});
  await expect(dialog.getByRole("textbox", {name:"Bookmark title 1"})).toHaveValue("Bản vẽ kiến trúc");
  await expect(dialog.getByRole("combobox", {name:"Parent bookmark 2"})).toHaveValue("0");
  await search.fill("móng");
  await expect(dialog.locator("[data-tpdf-bookmark-index]")).toHaveCount(1);
  await expect(dialog.getByRole("textbox", {name:"Bookmark title 2"})).toHaveValue("Cấu tạo móng");
});
