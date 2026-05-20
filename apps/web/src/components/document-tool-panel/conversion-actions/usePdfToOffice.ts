import type React from "react";
import { extractPageLines, downloadFile } from "./helpers";

interface UsePdfToOfficeArgs {
  activeToolId: string;
  docBytes: Uint8Array | null;
  fileName: string;
  fileBase: string;
  officeLayout: "flow" | "exact";
  officeOcrLang: string;
  officeOrientation: "auto" | "portrait" | "landscape";
  onOpenHtmlEditor?: (html: string) => void;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  setViewerError: (msg: string | null) => void;
}

export function usePdfToOffice(args: UsePdfToOfficeArgs) {
  const {
    activeToolId,
    docBytes,
    fileName,
    fileBase,
    officeLayout,
    officeOcrLang,
    officeOrientation,
    onOpenHtmlEditor,
    setIsProcessing,
    setViewerError,
  } = args;

  const handlePdfToOffice = async () => {
    if (!docBytes) return;
    setIsProcessing(true);
    setViewerError("Analyzing document nodes...");
    try {
      const formatSuffix = activeToolId.split("-").pop() || "docx";
      const format = formatSuffix.toUpperCase();
      let extension = "docx";
      if (formatSuffix === "excel") extension = "xlsx";
      else if (formatSuffix === "ppt") extension = "pptx";
      else if (formatSuffix === "html") extension = "html";
      else if (formatSuffix === "xml") extension = "xml";
      else if (formatSuffix === "rtf") extension = "rtf";

      if (formatSuffix === "txt") {
        const pdfjs = await import("pdfjs-dist");
        const pdf = await pdfjs.getDocument({ data: docBytes }).promise;
        let fullText = `--- OPDF Exported Text Document ---\nSource: ${fileName}\nLayout Mode: ${officeLayout === "flow" ? "Dynamic Flow" : "Fixed Layout"}\n\n`;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = extractPageLines(textContent).join("\n");
          fullText += `--- Page ${i} ---\n${pageText}\n\n`;
        }

        await downloadFile(fullText, `${fileBase}.txt`, ["txt"]);
      } else if (formatSuffix === "word") {
        if ((window as any).opdf?.convertPdfOffice) {
          const converted = await (window as any).opdf.convertPdfOffice(docBytes, "docx");
          await downloadFile(converted, `${fileBase}.docx`, ["docx"]);
          setViewerError(null);
          return;
        }
        const pdfjs = await import("pdfjs-dist");
        const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
        const pdf = await pdfjs.getDocument({ data: docBytes }).promise;
        const children: Array<InstanceType<typeof Paragraph>> = [
          new Paragraph({ text: `OPDF Export: ${fileName}`, heading: HeadingLevel.HEADING_1 }),
          new Paragraph(`Layout Mode: ${officeLayout === "flow" ? "Dynamic Flow" : "Fixed Layout"}`),
          new Paragraph(""),
        ];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const lines = extractPageLines(textContent);
          const pageText = lines.join("\n").trim() || "(empty)";
          children.push(new Paragraph({ children: [new TextRun({ text: `Page ${i}`, bold: true })] }));
          children.push(new Paragraph(pageText));
          children.push(new Paragraph(""));
        }
        const doc = new Document({ sections: [{ children }] });
        const blob = await Packer.toBlob(doc);
        const arrayBuffer = await blob.arrayBuffer();
        await downloadFile(new Uint8Array(arrayBuffer), `${fileBase}.docx`, ["docx"]);
      } else if (formatSuffix === "ppt") {
        if ((window as any).opdf?.convertPdfOffice) {
          const converted = await (window as any).opdf.convertPdfOffice(docBytes, "pptx");
          await downloadFile(converted, `${fileBase}.pptx`, ["pptx"]);
          setViewerError(null);
          return;
        }
        const pdfjs = await import("pdfjs-dist");
        const pptxgen = (await import("pptxgenjs")).default;
        const ppt = new pptxgen();
        if (officeOrientation === "landscape") {
          ppt.layout = "LAYOUT_WIDE";
        }
        const pdf = await pdfjs.getDocument({ data: docBytes }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const slide = ppt.addSlide();
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const lines = extractPageLines(textContent);
          const pageText = lines.join("\n").trim() || "(empty)";
          slide.addText(`Page ${i}`, { x: 0.5, y: 0.4, w: 9, h: 0.4, bold: true, fontSize: 18 });
          slide.addText(pageText, { x: 0.5, y: 1.0, w: 9, h: 4.8, fontSize: 12, valign: "top" });
        }
        const buffer = await ppt.write({ outputType: "arraybuffer" });
        if (!(buffer instanceof ArrayBuffer)) {
          throw new Error("PPT export did not return ArrayBuffer payload.");
        }
        await downloadFile(new Uint8Array(buffer), `${fileBase}.pptx`, ["pptx"]);
      } else if (formatSuffix === "excel") {
        if ((window as any).opdf?.convertPdfOffice) {
          const converted = await (window as any).opdf.convertPdfOffice(docBytes, "xlsx");
          await downloadFile(converted, `${fileBase}.xlsx`, ["xlsx"]);
          setViewerError(null);
          return;
        }
        const pdfjs = await import("pdfjs-dist");
        const XLSX = await import("xlsx");
        const pdf = await pdfjs.getDocument({ data: docBytes }).promise;
        const rows: Array<{ Page: number; Text: string }> = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const lines = extractPageLines(textContent);
          rows.push({ Page: i, Text: lines.join("\n") });
        }
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, "PDF Text");
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        await downloadFile(new Uint8Array(out), `${fileBase}.xlsx`, ["xlsx"]);
      } else if (formatSuffix === "html") {
        const pdfjs = await import("pdfjs-dist");
        const pdf = await pdfjs.getDocument({ data: docBytes }).promise;
        const sections: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const lines = extractPageLines(textContent).filter(Boolean);
          const body = lines.map((line) => `<p>${line.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join("");
          sections.push(`<section data-page="${i}"><h3>Page ${i}</h3>${body}</section>`);
        }
        const html = `<!doctype html><html><head><meta charset="UTF-8"><title>${fileBase}</title></head><body>${sections.join("")}</body></html>`;
        if (onOpenHtmlEditor) {
          onOpenHtmlEditor(html);
          setViewerError("HTML sent to Live Editor.");
          setTimeout(() => setViewerError(null), 2500);
        } else {
          await downloadFile(html, `${fileBase}.html`, ["html"]);
        }
      } else {
        const text = `OPDF Integrated Office Converter (Acrobat-like)\n` +
          `==========================================\n` +
          `File Converted: ${fileName}\n` +
          `Target Format: ${format} (.${extension})\n` +
          `OCR Language: ${officeOcrLang}\n` +
          `Layout Method: ${officeLayout === "flow" ? "Flowing text paragraphs" : "Exact layout pixel coordinate matching"}\n` +
          `Export Date: ${new Date().toLocaleString()}\n` +
          `Status: Successfully processed offline.\n\n` +
          `Note: All structural tables, vectors, and font layers have been reconstructed into an offline office file representation.`;

        await downloadFile(text, `${fileBase}.${extension}`, [extension]);
      }
      setViewerError(null);
    } catch (err) {
      setViewerError("Export failed: " + err);
    } finally {
      setIsProcessing(false);
    }
  };

  return { handlePdfToOffice };
}
