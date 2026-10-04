import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function createSamplePdf(outDir, pageCount = 3) {
  await mkdir(outDir, { recursive: true });
  const path = resolve(outDir, "opdf-cli-sample.pdf");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText("OPDF Automation CLI", {
      x: 54,
      y: 770,
      size: 28,
      font,
      color: rgb(0.12, 0.2, 0.34),
    });
    page.drawText(`Automation sample page ${index + 1}`, { x: 54, y: 720, size: 18, font });
    page.drawText("Generated automatically for non-destructive production QA.", {
      x: 54,
      y: 680,
      size: 12,
      font,
    });
    page.drawRectangle({ x: 54, y: 540, width: 480, height: 90, borderWidth: 1 });
  }

  await writeFile(path, await pdf.save());
  return path;
}
