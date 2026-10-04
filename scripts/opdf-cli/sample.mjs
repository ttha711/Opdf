import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function createSamplePdf(outDir, pageCount = 3, options = {}) {
  await mkdir(outDir, { recursive: true });
  const fileName = options.fileName || "opdf-cli-sample.pdf";
  const title = options.title || "OPDF Automation CLI";
  const marker = options.marker || "OPDF-E2E";
  const path = resolve(outDir, fileName);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText(title, {
      x: 54,
      y: 770,
      size: 28,
      font,
      color: rgb(0.12, 0.2, 0.34),
    });
    page.drawText(`Automation sample page ${index + 1}`, { x: 54, y: 720, size: 18, font });
    page.drawText(`${marker}-PAGE-${index + 1}`, { x: 54, y: 690, size: 14, font });
    page.drawText("Generated automatically for OPDF production QA.", {
      x: 54,
      y: 660,
      size: 12,
      font,
    });
    if (index === 1) {
      page.drawText(`SECRET-${marker}`, {
        x: 54,
        y: 620,
        size: 18,
        font,
        color: rgb(0.7, 0.05, 0.05),
      });
    }
    page.drawRectangle({ x: 54, y: 500, width: 480, height: 90, borderWidth: 1 });
  }

  await writeFile(path, await pdf.save());
  return path;
}
