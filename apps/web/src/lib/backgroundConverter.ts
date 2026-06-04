import * as pdfjsLib from "pdfjs-dist";

// Configure worker for pdfjs-dist inside the web app
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const buildDocxPageSize = (pageWidth?: number, pageHeight?: number) => {
  if (!pageWidth || !pageHeight || pageWidth <= 0 || pageHeight <= 0) {
    return undefined;
  }

  return {
    width: `${(pageWidth / 72).toFixed(2)}in`,
    height: `${(pageHeight / 72).toFixed(2)}in`,
  };
};

export async function runBackgroundOcrAndExport(
  bytes: Uint8Array,
  fileName: string,
  format: string,
  setViewerError: (msg: string | null) => void
) {
  setViewerError("Starting automatic layout conversion...");
  try {
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const totalPages = pdf.numPages;
    let combinedHtml = "";
    let combinedText = "";
    let pageSize: { width: string; height: string } | undefined;

    for (let i = 1; i <= totalPages; i++) {
      setViewerError(`Processing Page ${i} of ${totalPages}...`);
      const page = await pdf.getPage(i);
      if (!pageSize) {
        const sourceViewport = page.getViewport({ scale: 1.0 });
        pageSize = buildDocxPageSize(sourceViewport.width, sourceViewport.height);
      }
      const viewport = page.getViewport({ scale: 1.5 }); // High resolution for OCR
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: ctx, viewport }).promise;
      const b64Img = canvas.toDataURL("image/jpeg", 0.85);

      // Call OCR conversion endpoint (proxied to 5175 via Vite proxy)
      const res = await fetch("/api/convert-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64Img })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `Failed to convert page ${i}`);
      }

      if (data.html) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = data.html;

        // Convert crop-image-placeholder elements to actual base64 cropped images
        const placeholders = tempDiv.querySelectorAll(".crop-image-placeholder");
        placeholders.forEach((el) => {
          const xPercent = parseFloat(el.getAttribute("data-crop-x") || el.getAttribute("data-x") || "0");
          const yPercent = parseFloat(el.getAttribute("data-crop-y") || el.getAttribute("data-y") || "0");
          const wPercent = parseFloat(el.getAttribute("data-crop-w") || el.getAttribute("data-w") || "0");
          const hPercent = parseFloat(el.getAttribute("data-crop-h") || el.getAttribute("data-h") || "0");
          const label = el.getAttribute("aria-label") || "image";

          if (wPercent > 0 && hPercent > 0) {
            const cropX = (xPercent / 100) * canvas.width;
            const cropY = (yPercent / 100) * canvas.height;
            const cropW = (wPercent / 100) * canvas.width;
            const cropH = (hPercent / 100) * canvas.height;

            try {
              const cropCanvas = document.createElement("canvas");
              cropCanvas.width = cropW;
              cropCanvas.height = cropH;
              const cropCtx = cropCanvas.getContext("2d");
              if (cropCtx) {
                cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
                const base64Crop = cropCanvas.toDataURL("image/jpeg", 0.9);

                const imgEl = document.createElement("img");
                imgEl.src = base64Crop;
                imgEl.alt = label;
                imgEl.setAttribute("style", "max-width: 100%; height: auto; display: block; margin: 12pt auto; border-radius: 4px;");

                el.parentNode?.replaceChild(imgEl, el);
              }
            } catch (err) {
              console.error("Failed to crop image placeholder:", err);
            }
          }
        });

        const processedHtml = tempDiv.innerHTML;
        combinedHtml += `<!-- PAGE ${i} -->\n${processedHtml}\n<div style="page-break-after: always; height: 1px;"></div>\n`;
        combinedText += `--- Page ${i} ---\n${tempDiv.textContent || tempDiv.innerText || ""}\n\n`;
      }
    }

    setViewerError("Compiling final layout...");
    const fileBase = fileName.replace(/\.[^/.]+$/, "");

    if (format === "word") {
      const res = await fetch("/api/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: combinedHtml, title: fileBase, pageSize })
      });
      if (!res.ok) throw new Error("Failed to export Word document via API");
      const blob = await res.blob();
      downloadBlob(blob, `${fileBase}.docx`);
    } else if (format === "html") {
      const blob = new Blob([combinedHtml], { type: "text/html;charset=utf-8" });
      downloadBlob(blob, `${fileBase}.html`);
    } else if (format === "txt") {
      const blob = new Blob([combinedText], { type: "text/plain;charset=utf-8" });
      downloadBlob(blob, `${fileBase}.txt`);
    } else if (format === "rtf") {
      const rtfHeader = "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fnil\\fcharset0 Calibri;}}\n\\viewkind4\\uc1\\pard\\lang1033\\f0\\fs22 ";
      const rtfContent = combinedText.replace(/\n/g, "\\par\n");
      const rtfFooter = "}";
      const blob = new Blob([rtfHeader + rtfContent + rtfFooter], { type: "application/rtf;charset=utf-8" });
      downloadBlob(blob, `${fileBase}.rtf`);
    } else if (format === "xml") {
      let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<document title="${fileBase}">\n`;
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = combinedHtml;
      tempDiv.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
        xmlContent += `  <heading level="${el.tagName[1]}">${escapeXml(el.textContent || "")}</heading>\n`;
      });
      tempDiv.querySelectorAll("p").forEach(el => {
        xmlContent += `  <paragraph>${escapeXml(el.textContent || "")}</paragraph>\n`;
      });
      xmlContent += `</document>`;
      const blob = new Blob([xmlContent], { type: "application/xml;charset=utf-8" });
      downloadBlob(blob, `${fileBase}.xml`);
    } else if (format === "excel") {
      const { utils, write } = await import("xlsx");
      const wb = utils.book_new();
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = combinedHtml;
      const tables = tempDiv.querySelectorAll("table");

      if (tables.length > 0) {
        tables.forEach((table, index) => {
          const ws = utils.table_to_sheet(table);
          utils.book_append_sheet(wb, ws, `Table ${index + 1}`);
        });
      } else {
        const ws = utils.aoa_to_sheet(combinedText.split("\n").map(line => [line]));
        utils.book_append_sheet(wb, ws, "Extracted Text");
      }
      const out = write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([new Uint8Array(out)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      downloadBlob(blob, `${fileBase}.xlsx`);
    } else if (format === "powerpoint") {
      const pptxgen = (await import("pptxgenjs")).default;
      const ppt = new pptxgen();
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = combinedHtml;
      
      const headers = tempDiv.querySelectorAll("h1, h2");
      if (headers.length > 0) {
        headers.forEach((h) => {
          const slide = ppt.addSlide();
          slide.addText(h.textContent || "", { x: 0.5, y: 0.5, w: 9, h: 1, bold: true, fontSize: 24 });
          
          let text = "";
          let sibling = h.nextElementSibling;
          while (sibling && !["H1", "H2"].includes(sibling.tagName)) {
            if (sibling.textContent) text += sibling.textContent + "\n";
            sibling = sibling.nextElementSibling;
          }
          slide.addText(text.trim().substring(0, 500), { x: 0.5, y: 1.8, w: 9, h: 4, fontSize: 14, valign: "top" });
        });
      } else {
        const slide = ppt.addSlide();
        slide.addText(combinedText.substring(0, 1000), { x: 0.5, y: 0.5, w: 9, h: 5, fontSize: 12 });
      }
      
      const buffer = await ppt.write({ outputType: "arraybuffer" });
      if (buffer instanceof ArrayBuffer) {
        const blob = new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
        downloadBlob(blob, `${fileBase}.pptx`);
      }
    }

    setViewerError(null);
  } catch (err: any) {
    console.error("Automatic conversion failed:", err);
    setViewerError(`Conversion failed: ${err.message || err}`);
    alert(`Failed to complete conversion: ${err.message || err}`);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case "\"": return "&quot;";
      default: return c;
    }
  });
}
