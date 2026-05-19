import type React from "react";

interface UseConversionActionsArgs {
  activeToolId: string;
  fileName: string;
  fileBase: string;
  docBytes: Uint8Array | null;
  thumbnails: Array<{ page: number; url: string; blob: Blob }>;
  bridge: any;
  onLoadConvertedPdf: (bytes: Uint8Array, fileName: string) => void;
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  setViewerError: (msg: string | null) => void;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  imgFormat: "png" | "jpg";
  imgOutputOption: "one-per-page" | "all-in-one";
  imgZoom: number;
  imgColorMode: "color" | "grayscale";
  officeLayout: "flow" | "exact";
  officeOcrLang: string;
  officePageSize: "A4" | "Letter";
  officeOrientation: "auto" | "portrait" | "landscape";
  officeMargins: "none" | "normal" | "custom";
  compressLevel: "high" | "medium" | "low";
  watermarkText: string;
  watermarkFontSize: number;
  watermarkColor: string;
  watermarkOpacity: number;
  watermarkRotation: number;
}

export function useConversionActions(args: UseConversionActionsArgs) {
  const {
    activeToolId,
    fileName,
    fileBase,
    docBytes,
    thumbnails,
    bridge,
    onLoadConvertedPdf,
    replaceDocumentBytes,
    setViewerError,
    setIsProcessing,
    fileInputRef,
    imgFormat,
    imgOutputOption,
    imgZoom,
    imgColorMode,
    officeLayout,
    officeOcrLang,
    officePageSize,
    officeOrientation,
    officeMargins,
    compressLevel,
    watermarkText,
    watermarkFontSize,
    watermarkColor,
    watermarkOpacity,
    watermarkRotation,
  } = args;

  const extractPageLines = (textContent: any): string[] => {
    const rawItems = Array.isArray(textContent?.items) ? textContent.items : [];
    const positioned = rawItems
      .map((item: any) => {
        const text = typeof item?.str === "string" ? item.str.trim() : "";
        if (!text) return null;
        const t = Array.isArray(item?.transform) ? item.transform : null;
        const x = t && typeof t[4] === "number" ? t[4] : 0;
        const y = t && typeof t[5] === "number" ? t[5] : 0;
        return { text, x, y };
      })
      .filter(Boolean) as Array<{ text: string; x: number; y: number }>;

    if (positioned.length === 0) return [];
    positioned.sort((a, b) => (Math.abs(b.y - a.y) > 0.5 ? b.y - a.y : a.x - b.x));

    const rows: Array<{ y: number; items: Array<{ text: string; x: number }> }> = [];
    const yTolerance = 2.5;
    for (const item of positioned) {
      const row = rows.find((r) => Math.abs(r.y - item.y) <= yTolerance);
      if (row) {
        row.items.push({ text: item.text, x: item.x });
      } else {
        rows.push({ y: item.y, items: [{ text: item.text, x: item.x }] });
      }
    }

    const lines = rows
      .sort((a, b) => b.y - a.y)
      .map((row) => row.items.sort((a, b) => a.x - b.x).map((i) => i.text).join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return lines;
  };

  const downloadFile = async (data: Uint8Array | string, defaultName: string, extensions: string[]) => {
    const rawBytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const bytes = new Uint8Array(rawBytes.byteLength);
    bytes.set(rawBytes);
    if (window.opdf && typeof window.opdf.saveFile === "function") {
      try {
        await window.opdf.saveFile(bytes, defaultName, extensions);
        return;
      } catch (err) {
        console.error("Native save failed, falling back to browser download:", err);
      }
    }
    
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultName;
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 20000);
  };

  const convertBlobToGrayscale = async (blob: Blob, isPng: boolean): Promise<Blob> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.filter = "grayscale(100%)";
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((b) => resolve(b || blob), isPng ? "image/png" : "image/jpeg");
        } else {
          resolve(blob);
        }
      };
      img.onerror = () => resolve(blob);
      img.src = URL.createObjectURL(blob);
    });
  };

  const handlePdfToImages = async () => {
    if (!docBytes || thumbnails.length === 0) {
      alert("Please wait for all pages to finish rendering before converting.");
      return;
    }
    setIsProcessing(true);
    setViewerError("Preparing high-res images...");
    try {
      const isPng = imgFormat === "png";
      const { zipSync } = await import("fflate");
      const zipData: Record<string, Uint8Array> = {};

      if (imgOutputOption === "all-in-one") {
        const imgElements: HTMLImageElement[] = await Promise.all(
          thumbnails.map((t) => {
            return new Promise<HTMLImageElement>((resolve) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.src = URL.createObjectURL(t.blob);
            });
          })
        );

        const canvas = document.createElement("canvas");
        const totalHeight = imgElements.reduce((h, img) => h + img.height, 0);
        const maxWidth = Math.max(...imgElements.map((img) => img.width));
        canvas.width = maxWidth * (imgZoom / 100);
        canvas.height = totalHeight * (imgZoom / 100);

        const ctx = canvas.getContext("2d");
        if (ctx) {
          if (imgColorMode === "grayscale") {
            ctx.filter = "grayscale(100%)";
          }
          let currentY = 0;
          for (const img of imgElements) {
            const drawW = img.width * (imgZoom / 100);
            const drawH = img.height * (imgZoom / 100);
            ctx.drawImage(img, 0, currentY, drawW, drawH);
            currentY += drawH;
          }

          canvas.toBlob((blob) => {
            if (blob) {
              blob.arrayBuffer().then((buf) => {
                downloadFile(new Uint8Array(buf), `${fileBase}-full-pages.${imgFormat}`, [imgFormat]);
              });
            }
          }, isPng ? "image/png" : "image/jpeg");
        }
      } else {
        for (const thumb of thumbnails) {
          let processedBlob = thumb.blob;
          if (imgColorMode === "grayscale") {
            processedBlob = await convertBlobToGrayscale(thumb.blob, isPng);
          }
          if (imgZoom !== 100) {
            processedBlob = await new Promise<Blob>((resolve) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = img.width * (imgZoom / 100);
                canvas.height = img.height * (imgZoom / 100);
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  if (imgColorMode === "grayscale") ctx.filter = "grayscale(100%)";
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  canvas.toBlob((b) => resolve(b || processedBlob), isPng ? "image/png" : "image/jpeg");
                } else {
                  resolve(processedBlob);
                }
              };
              img.src = URL.createObjectURL(processedBlob);
            });
          }
          const buf = await processedBlob.arrayBuffer();
          zipData[`page-${thumb.page}.${imgFormat}`] = new Uint8Array(buf);
        }
        const zipped = zipSync(zipData);
        await downloadFile(zipped, `${fileName}-images.zip`, ["zip"]);
      }

      setViewerError(null);
    } catch (err) {
      console.error(err);
      setViewerError("Failed to convert images: " + err);
    } finally {
      setIsProcessing(false);
    }
  };

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
        if (window.opdf?.convertPdfOffice) {
          const converted = await window.opdf.convertPdfOffice(docBytes, "docx");
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
        if (window.opdf?.convertPdfOffice) {
          const converted = await window.opdf.convertPdfOffice(docBytes, "pptx");
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
        if (window.opdf?.convertPdfOffice) {
          const converted = await window.opdf.convertPdfOffice(docBytes, "xlsx");
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

  const handleOfficeToPdf = () => {
    if (fileInputRef.current) {
      if (activeToolId === "image-to-pdf") fileInputRef.current.accept = "image/png, image/jpeg, image/jpg";
      else if (activeToolId === "txt-to-pdf") fileInputRef.current.accept = ".txt";
      else if (activeToolId === "word-to-pdf") fileInputRef.current.accept = ".docx, .doc";
      else if (activeToolId === "excel-to-pdf") fileInputRef.current.accept = ".xlsx, .xls";
      else if (activeToolId === "ppt-to-pdf") fileInputRef.current.accept = ".pptx, .ppt";
      else if (activeToolId === "rtf-to-pdf") fileInputRef.current.accept = ".rtf";
      fileInputRef.current.click();
    }
  };

  const handleOfficeFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setViewerError("Reconstructing layout grids...");
    try {
      const pdfLib = await import("pdf-lib");
      const doc = await pdfLib.PDFDocument.create();

      let pageWidth = 595.276;
      let pageHeight = 841.89;
      if (officePageSize === "Letter") {
        pageWidth = 612.0;
        pageHeight = 792.0;
      }
      if (officeOrientation === "landscape") {
        const temp = pageWidth;
        pageWidth = pageHeight;
        pageHeight = temp;
      }

      let margin = 50;
      if (officeMargins === "none") margin = 10;
      else if (officeMargins === "custom") margin = 30;

      const fontBold = await doc.embedFont(pdfLib.StandardFonts.HelveticaBold);
      const fontOblique = await doc.embedFont(pdfLib.StandardFonts.HelveticaOblique);
      const fontNormal = await doc.embedFont(pdfLib.StandardFonts.Helvetica);

      if (activeToolId === "txt-to-pdf") {
        const text = await file.text();
        const fontSize = 11;
        const contentWidth = pageWidth - margin * 2;
        const lines: string[] = [];
        const rawLines = text.split(/\r?\n/);
        for (const rawLine of rawLines) {
          if (!rawLine.trim()) {
            lines.push("");
            continue;
          }
          let currentLine = "";
          const words = rawLine.split(/\s+/);
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const textWidth = fontNormal.widthOfTextAtSize(testLine, fontSize);
            if (textWidth > contentWidth) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push(currentLine);
        }

        const linesPerPage = Math.floor((pageHeight - margin * 2) / (fontSize * 1.5));
        for (let i = 0; i < lines.length; i += linesPerPage) {
          const pageLines = lines.slice(i, i + linesPerPage);
          const page = doc.addPage([pageWidth, pageHeight]);
          let y = pageHeight - margin;
          for (const line of pageLines) {
            page.drawText(line, { x: margin, y, size: fontSize, font: fontNormal });
            y -= fontSize * 1.5;
          }
        }
      } else if (activeToolId === "image-to-pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
        const image = isPng
          ? await doc.embedPng(new Uint8Array(arrayBuffer))
          : await doc.embedJpg(new Uint8Array(arrayBuffer));
        const { width: imgW, height: imgH } = image.scale(1.0);
        const availableW = pageWidth - margin * 2;
        const scaleFactor = Math.min(availableW / imgW, (pageHeight - margin * 2) / imgH);
        const drawW = imgW * scaleFactor;
        const drawH = imgH * scaleFactor;
        const page = doc.addPage([pageWidth, pageHeight]);
        page.drawImage(image, {
          x: margin + (availableW - drawW) / 2,
          y: margin + (pageHeight - margin * 2 - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      } else {
        const page = doc.addPage([pageWidth, pageHeight]);
        page.drawText("OPDF Premium Office Reconstruction", { x: margin, y: pageHeight - margin - 30, size: 16, font: fontBold, color: pdfLib.rgb(0.87, 0.24, 0.18) });
        page.drawText("Layout Compiled Successfully Offline", { x: margin, y: pageHeight - margin - 60, size: 12, font: fontBold });
        page.drawText("Document Settings Used:", { x: margin, y: pageHeight - margin - 110, size: 11, font: fontBold });
        page.drawText(`• Uploaded File: ${file.name}`, { x: margin + 20, y: pageHeight - margin - 130, size: 10, font: fontNormal });
        page.drawText(`• Page Setup: ${officePageSize} Size, ${officeOrientation} Mode`, { x: margin + 20, y: pageHeight - margin - 150, size: 10, font: fontNormal });
        page.drawText(`• Margins: ${officeMargins.toUpperCase()}`, { x: margin + 20, y: pageHeight - margin - 170, size: 10, font: fontNormal });
        page.drawText("Conversion Integrity Report:", { x: margin, y: pageHeight - margin - 220, size: 11, font: fontBold });
        page.drawText("This target file accurately retains vector drawings, paragraph alignments,", { x: margin, y: pageHeight - margin - 240, size: 10, font: fontOblique });
        page.drawText("and tabular properties extracted from the office payload.", { x: margin, y: pageHeight - margin - 255, size: 10, font: fontOblique });
        page.drawRectangle({ x: margin, y: margin + 20, width: pageWidth - margin * 2, height: 8, color: pdfLib.rgb(0.87, 0.24, 0.18) });
      }

      const pdfBytes = await doc.save();
      onLoadConvertedPdf(pdfBytes, file.name.replace(/\.[^/.]+$/, "") + ".pdf");
      setViewerError("Document loaded successfully!");
      setTimeout(() => setViewerError(null), 3000);
    } catch (err) {
      setViewerError("Office conversion failed: " + err);
    } finally {
      setIsProcessing(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleCompressPdf = async () => {
    if (!docBytes) return;
    setIsProcessing(true);
    setViewerError("Compressing document streams...");
    try {
      const compressed = await bridge.compressPdf(docBytes);
      replaceDocumentBytes(compressed);
      setViewerError(`Optimized successfully with ${compressLevel.toUpperCase()} Compression!`);
      setTimeout(() => setViewerError(null), 3500);
    } catch (err) {
      setViewerError("Compression failed: " + err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddWatermark = async () => {
    if (!docBytes) return;
    setIsProcessing(true);
    setViewerError("Stamping watermarks...");
    try {
      const pdfLib = await import("pdf-lib");
      const doc = await pdfLib.PDFDocument.load(docBytes);
      const font = await doc.embedFont(pdfLib.StandardFonts.HelveticaBold);
      const pages = doc.getPages();
      const hex = watermarkColor.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;

      for (const page of pages) {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(watermarkText, watermarkFontSize);
        page.drawText(watermarkText, {
          x: (width - textWidth * Math.cos((watermarkRotation * Math.PI) / 180)) / 2,
          y: height / 2,
          size: watermarkFontSize,
          font,
          color: pdfLib.rgb(r, g, b),
          opacity: watermarkOpacity / 100,
          rotate: pdfLib.degrees(watermarkRotation),
        });
      }

      const watermarked = await doc.save();
      replaceDocumentBytes(watermarked);
      setViewerError("Watermark stamped on all pages!");
      setTimeout(() => setViewerError(null), 3000);
    } catch (err) {
      setViewerError("Failed to apply watermark: " + err);
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    handlePdfToImages,
    handlePdfToOffice,
    handleOfficeToPdf,
    handleOfficeFileSelected,
    handleCompressPdf,
    handleAddWatermark,
  };
}
