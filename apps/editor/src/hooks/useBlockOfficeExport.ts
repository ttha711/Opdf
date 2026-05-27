import { useState } from "react";
import * as XLSX from "xlsx";
import pptxgen from "pptxgenjs";
import { AIParsedDocument, DocumentBlock } from "../types";
import { evaluateFormula } from "../lib/formulaEngine";

// ─────────────────────────────────────────────────────────
// HTML helpers for DOCX export
// ─────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Convert a DocumentBlock to a styled HTML fragment suitable for DOCX.
 * Rich content (bold/italic/colors in editorHtml) is preserved by using
 * content directly (which may already contain inline HTML).
 */
function blockToDocxHtml(
  block: DocumentBlock,
  evalFn: typeof evaluateFormula
): string {
  switch (block.type) {
    case "heading": {
      const lvl = block.meta?.level || 1;
      const colorMap: Record<number, string> = { 1: "#1F4E79", 2: "#2E74B5", 3: "#1a3a5c" };
      const sizeMap: Record<number, string> = { 1: "22pt", 2: "16pt", 3: "13pt" };
      const mt = lvl === 1 ? "24pt" : lvl === 2 ? "16pt" : "12pt";
      return `<h${lvl} style="color:${colorMap[lvl]};font-size:${sizeMap[lvl]};font-weight:bold;margin-top:${mt};margin-bottom:6pt;font-family:Calibri,Arial,sans-serif;">${block.content || esc(block.content)}</h${lvl}>`;
    }

    case "paragraph": {
      let html = `<p style="margin-bottom:8pt;line-height:1.5;font-family:Calibri,Arial,sans-serif;font-size:11pt;">${block.content || ""}</p>`;
      if (block.meta?.bulletPoints && block.meta.bulletPoints.length > 0) {
        html += `<ul style="margin-left:18pt;margin-bottom:10pt;">`;
        block.meta.bulletPoints.forEach(bp => {
          html += `<li style="margin-bottom:4pt;font-size:11pt;font-family:Calibri,Arial,sans-serif;">${esc(bp)}</li>`;
        });
        html += `</ul>`;
      }
      return html;
    }

    case "callout": {
      const bgMap: Record<string, string> = {
        info: "#eff6ff",
        warning: "#fffbeb",
        success: "#f0fdf4",
        danger: "#fef2f2",
      };
      const borderMap: Record<string, string> = {
        info: "#3b82f6",
        warning: "#f59e0b",
        success: "#22c55e",
        danger: "#ef4444",
      };
      const type = block.meta?.calloutType || "info";
      return `<div style="background:${bgMap[type]};border-left:4px solid ${borderMap[type]};padding:10px 14px;margin:12px 0;border-radius:0 6px 6px 0;font-size:11pt;font-family:Calibri,Arial,sans-serif;">${block.content}</div>`;
    }

    case "table": {
      if (!block.tableData) return "";
      let html = `<table style="border-collapse:collapse;width:100%;margin-bottom:14pt;font-size:10pt;font-family:Calibri,Arial,sans-serif;">`;
      block.tableData.forEach((row, ri) => {
        html += `<tr>`;
        row.forEach(cell => {
          const val = cell.formula
            ? evalFn(cell.formula, block.tableData!)
            : cell.value;
          const isHeader = ri === 0;
          const align = cell.align || "left";
          const bgColor = cell.bgColor || (isHeader ? "#EBF3FB" : "transparent");
          const fontWeight = cell.bold || isHeader ? "bold" : "normal";
          const fontStyle = cell.italic ? "italic" : "normal";
          const color = cell.color || (isHeader ? "#1F4E79" : "#333");

          if (isHeader) {
            html += `<th style="border:1px solid #AECCE4;padding:7px 10px;background:${bgColor};font-weight:${fontWeight};text-align:${align};color:${color};font-size:10pt;">${esc(val)}</th>`;
          } else {
            html += `<td style="border:1px solid #D8E4F0;padding:6px 10px;background:${bgColor};font-weight:${fontWeight};font-style:${fontStyle};text-align:${align};color:${color};font-size:10pt;">${esc(val)}</td>`;
          }
        });
        html += `</tr>`;
      });
      html += `</table>`;
      return html;
    }

    case "page-break":
      return `<div style="page-break-before:always;height:1px;"></div>`;

    case "divider":
      return `<hr style="border:none;border-top:1.5px solid #e2e8f0;margin:16px 0;" />`;

    case "image":
      if (block.meta?.imageSrc) {
        return `<div style="text-align:center;margin:12px 0;"><img src="${block.meta.imageSrc}" alt="${esc(block.meta.imageAlt || "image")}" style="max-width:${block.meta.imageWidth || "100%"};height:auto;border-radius:4px;" /></div>`;
      }
      return "";

    case "slide": {
      // Include slides as a section in DOCX
      const bps = block.meta?.bulletPoints || [];
      let html = `<div style="background:#1e293b;padding:20px 24px;margin:16px 0;border-radius:8px;color:white;">`;
      html += `<h2 style="color:white;font-size:16pt;font-weight:bold;margin:0 0 12px;font-family:Calibri,Arial,sans-serif;">${esc(block.content)}</h2>`;
      if (bps.length > 0) {
        html += `<ul style="margin-left:16px;padding:0;">`;
        bps.forEach(bp => {
          html += `<li style="color:#e2e8f0;font-size:11pt;margin-bottom:6px;font-family:Calibri,Arial,sans-serif;">${esc(bp)}</li>`;
        });
        html += `</ul>`;
      }
      html += `</div>`;
      return html;
    }

    default:
      return "";
  }
}

// ─────────────────────────────────────────────────────────
// XLSX column width auto-fit helper
// ─────────────────────────────────────────────────────────
function getMaxColWidths(data: string[][]): number[] {
  if (!data.length) return [];
  const widths = new Array(data[0].length).fill(10);
  data.forEach(row => {
    row.forEach((cell, ci) => {
      const len = String(cell || "").length;
      if (len > widths[ci]) widths[ci] = Math.min(len + 2, 50);
    });
  });
  return widths;
}

// ─────────────────────────────────────────────────────────
// Main export hook
// ─────────────────────────────────────────────────────────
export function useBlockOfficeExport(
  currentDoc: AIParsedDocument,
  evalFn: typeof evaluateFormula = evaluateFormula,
  onToast?: (msg: string, type?: "success" | "error" | "info") => void
) {
  const [isExporting, setIsExporting] = useState<string | null>(null);

  // ── DOCX Export ─────────────────────────────────────────
  const exportToDOCX = async () => {
    setIsExporting("docx");
    try {
      const contentHtml = currentDoc.blocks
        .map(b => blockToDocxHtml(b, evalFn))
        .filter(Boolean)
        .join("\n");

      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(currentDoc.title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Calibri&display=swap');
    body {
      font-family: Calibri, 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #2d3748;
      margin: 0;
      padding: 0;
    }
    h1 { font-size: 22pt; color: #1F4E79; font-weight: bold; }
    h2 { font-size: 16pt; color: #2E74B5; font-weight: bold; }
    h3 { font-size: 13pt; color: #1a3a5c; font-weight: bold; }
    p { margin-bottom: 8pt; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 14pt; }
    th { background: #EBF3FB; color: #1F4E79; border: 1px solid #AECCE4; padding: 7px 10px; }
    td { border: 1px solid #D8E4F0; padding: 6px 10px; }
    ul, ol { margin-left: 18pt; margin-bottom: 10pt; }
    li { margin-bottom: 4pt; }
    img { max-width: 100%; height: auto; }
    hr { border: none; border-top: 1.5px solid #e2e8f0; margin: 16px 0; }
  </style>
</head>
<body>
  <h1 style="color:#1F4E79;font-size:24pt;border-bottom:2px solid #2E74B5;padding-bottom:8pt;margin-bottom:20pt;">${esc(currentDoc.title)}</h1>
  ${currentDoc.description ? `<p style="color:#64748b;font-size:10pt;margin-bottom:20pt;font-style:italic;">${esc(currentDoc.description)}</p>` : ""}
  ${contentHtml}
</body>
</html>`;

      const res = await fetch("/api/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: fullHtml, title: currentDoc.title }),
      });
      if (!res.ok) throw new Error("Export DOCX API failed");
      const blob = await res.blob();
      triggerDownload(blob, `${currentDoc.title}.docx`);
      onToast?.(`✅ Đã xuất file "${currentDoc.title}.docx"`, "success");
    } catch (err) {
      console.error("DOCX export error:", err);
      onToast?.("❌ Xuất Word thất bại. Vui lòng thử lại.", "error");
    } finally {
      setIsExporting(null);
    }
  };

  // ── XLSX Export ─────────────────────────────────────────
  const exportToXLSX = () => {
    setIsExporting("xlsx");
    try {
      const wb = XLSX.utils.book_new();
      const tables = currentDoc.blocks.filter(b => b.type === "table" && b.tableData);

      if (tables.length > 0) {
        tables.forEach((t, idx) => {
          const aoa = t.tableData!.map(row =>
            row.map(cell =>
              cell.formula
                ? evalFn(cell.formula, t.tableData!)
                : cell.value
            )
          );

          const ws = XLSX.utils.aoa_to_sheet(aoa);

          // Auto-fit column widths
          const colWidths = getMaxColWidths(aoa);
          ws["!cols"] = colWidths.map(w => ({ wch: w }));

          // Style header row: bold
          const headerRange = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
          for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r: 0, c });
            if (!ws[addr]) continue;
            ws[addr].s = {
              font: { bold: true },
              fill: { fgColor: { rgb: "EBF3FB" } },
              border: {
                top: { style: "thin", color: { rgb: "AECCE4" } },
                bottom: { style: "thin", color: { rgb: "AECCE4" } },
                left: { style: "thin", color: { rgb: "AECCE4" } },
                right: { style: "thin", color: { rgb: "AECCE4" } },
              },
            };
          }

          const sheetName = `Bảng ${idx + 1}`.slice(0, 31);
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
      } else {
        // Fallback: export text content as plain sheet
        const textRows: string[][] = [
          [currentDoc.title],
          [currentDoc.description],
          [""],
        ];
        currentDoc.blocks.forEach(b => {
          if (b.content) textRows.push([b.content.replace(/<[^>]*>/g, "").trim()]);
          if (b.meta?.bulletPoints) {
            b.meta.bulletPoints.forEach(bp => textRows.push([`  • ${bp}`]));
          }
        });
        const ws = XLSX.utils.aoa_to_sheet(textRows);
        XLSX.utils.book_append_sheet(wb, ws, "Tài liệu");
      }

      XLSX.writeFile(wb, `${currentDoc.title}.xlsx`);
      onToast?.(`✅ Đã xuất file "${currentDoc.title}.xlsx"`, "success");
    } catch (err) {
      console.error("XLSX export error:", err);
      onToast?.("❌ Xuất Excel thất bại. Vui lòng thử lại.", "error");
    } finally {
      setIsExporting(null);
    }
  };

  // ── PPTX Export ─────────────────────────────────────────
  const exportToPPTX = async () => {
    setIsExporting("pptx");
    try {
      const pptx = new pptxgen();
      pptx.layout = "LAYOUT_16x9";
      pptx.title = currentDoc.title;
      pptx.subject = currentDoc.description;

      const slides = currentDoc.blocks.filter(b => b.type === "slide");

      const BG_COLORS: Record<string, string> = {
        indigo: "3730A3",
        purple: "581C87",
        emerald: "064E3B",
        rose: "4C0519",
        slate: "0F172A",
        blue: "1D4ED8",
        amber: "92400E",
        teal: "0F766E",
      };

      const renderSlide = (sl: DocumentBlock) => {
        const slide = pptx.addSlide();
        const bgHex = BG_COLORS[sl.meta?.slideBg || "slate"] || "0F172A";
        slide.background = { fill: bgHex };

        const layout = sl.meta?.layout || "bullets";
        const bps = sl.meta?.bulletPoints || [];
        const title = sl.content || "";

        // Accent line at top
        slide.addShape(pptx.ShapeType.rect, {
          x: 0, y: 0, w: "100%", h: 0.04,
          fill: { color: "FFFFFF", transparency: 70 },
        });

        if (layout === "title") {
          slide.addText(title, {
            x: 0.5, y: 1.8, w: 9.0, h: 1.5,
            fontSize: 38, bold: true, color: "FFFFFF",
            align: "center", fontFace: "Calibri",
          });
          if (bps[0]) {
            slide.addText(bps[0], {
              x: 0.5, y: 3.6, w: 9.0, h: 0.8,
              fontSize: 20, color: "CBD5E1",
              align: "center", fontFace: "Calibri",
            });
          }
          // Decorative subtitle line
          slide.addShape(pptx.ShapeType.rect, {
            x: 4.0, y: 3.3, w: 2.0, h: 0.04,
            fill: { color: "6366F1" },
          });
        } else if (layout === "quote") {
          slide.addText(`" ${title} "`, {
            x: 0.8, y: 1.6, w: 8.4, h: 2.2,
            fontSize: 28, italic: true, color: "F59E0B",
            align: "center", fontFace: "Georgia",
          });
          if (bps[0]) {
            slide.addText(`— ${bps[0]}`, {
              x: 0.8, y: 3.9, w: 8.4, h: 0.6,
              fontSize: 16, color: "94A3B8",
              align: "center", fontFace: "Calibri",
            });
          }
        } else if (layout === "two-columns") {
          slide.addText(title, {
            x: 0.5, y: 0.4, w: 9.0, h: 0.8,
            fontSize: 24, bold: true, color: "FFFFFF", fontFace: "Calibri",
          });
          slide.addShape(pptx.ShapeType.rect, {
            x: 0.5, y: 1.35, w: 9.0, h: 0.03,
            fill: { color: "FFFFFF", transparency: 80 },
          });
          const mid = Math.ceil(bps.length / 2);
          const left = bps.slice(0, mid);
          const right = bps.slice(mid);
          left.forEach((pt, i) => {
            slide.addText(`• ${pt}`, {
              x: 0.5, y: 1.6 + i * 0.6, w: 4.4, h: 0.5,
              fontSize: 13, color: "E2E8F0", fontFace: "Calibri",
            });
          });
          right.forEach((pt, i) => {
            slide.addText(`• ${pt}`, {
              x: 5.1, y: 1.6 + i * 0.6, w: 4.4, h: 0.5,
              fontSize: 13, color: "E2E8F0", fontFace: "Calibri",
            });
          });
        } else if (layout === "image-left" || layout === "image-right") {
          const textX = layout === "image-left" ? 5.2 : 0.5;
          slide.addText(title, {
            x: textX, y: 0.5, w: 4.6, h: 0.9,
            fontSize: 20, bold: true, color: "FFFFFF", fontFace: "Calibri",
          });
          bps.slice(0, 5).forEach((pt, i) => {
            slide.addText(`• ${pt}`, {
              x: textX, y: 1.6 + i * 0.6, w: 4.6, h: 0.5,
              fontSize: 12, color: "CBD5E1", fontFace: "Calibri",
            });
          });
          // Placeholder image area
          slide.addShape(pptx.ShapeType.rect, {
            x: layout === "image-left" ? 0.4 : 5.2, y: 0.4, w: 4.5, h: 4.5,
            fill: { color: "FFFFFF", transparency: 88 },
            line: { color: "FFFFFF", transparency: 80, width: 1 },
          });
          slide.addText("[ Image Area ]", {
            x: layout === "image-left" ? 0.4 : 5.2, y: 2.2, w: 4.5, h: 1.0,
            fontSize: 12, color: "94A3B8", align: "center", fontFace: "Calibri",
          });
        } else {
          // Default: bullets layout
          slide.addText(title, {
            x: 0.5, y: 0.35, w: 9.0, h: 0.85,
            fontSize: 26, bold: true, color: "FFFFFF", fontFace: "Calibri",
          });
          slide.addShape(pptx.ShapeType.rect, {
            x: 0.5, y: 1.3, w: 9.0, h: 0.04,
            fill: { color: "FFFFFF", transparency: 80 },
          });
          bps.slice(0, 8).forEach((pt, i) => {
            slide.addText(`• ${pt}`, {
              x: 0.7, y: 1.5 + i * 0.6, w: 8.8, h: 0.5,
              fontSize: 14, color: "E2E8F0", fontFace: "Calibri",
            });
          });
        }

        // Slide number footer
        slide.addText(`${(pptx as any).slides.length}`, {
          x: 9.0, y: 4.9, w: 0.6, h: 0.35,
          fontSize: 10, color: "64748B", align: "right", fontFace: "Calibri",
        });
      };

      if (slides.length > 0) {
        slides.forEach(renderSlide);
      } else {
        // Auto-generate title + content slides from document blocks
        const titleSlide = pptx.addSlide();
        titleSlide.background = { fill: "0F172A" };
        titleSlide.addText(currentDoc.title, {
          x: 0.5, y: 1.8, w: 9.0, h: 1.5,
          fontSize: 36, bold: true, color: "FFFFFF", align: "center", fontFace: "Calibri",
        });
        if (currentDoc.description) {
          titleSlide.addText(currentDoc.description, {
            x: 0.5, y: 3.4, w: 9.0, h: 0.8,
            fontSize: 16, color: "94A3B8", align: "center", fontFace: "Calibri",
          });
        }

        const headings = currentDoc.blocks.filter(b => b.type === "heading" && (b.meta?.level || 1) <= 2);
        headings.forEach(heading => {
          const sl = pptx.addSlide();
          sl.background = { fill: "1E293B" };
          sl.addText(heading.content.replace(/<[^>]*>/g, ""), {
            x: 0.5, y: 0.4, w: 9.0, h: 0.9,
            fontSize: 24, bold: true, color: "FFFFFF", fontFace: "Calibri",
          });

          const hIdx = currentDoc.blocks.findIndex(b => b.id === heading.id);
          const relatedParas = currentDoc.blocks
            .slice(hIdx + 1)
            .filter(b => b.type === "paragraph")
            .slice(0, 4)
            .map(b => b.content.replace(/<[^>]*>/g, "").substring(0, 120));

          relatedParas.forEach((text, i) => {
            sl.addText(`• ${text}`, {
              x: 0.7, y: 1.5 + i * 0.7, w: 8.6, h: 0.6,
              fontSize: 13, color: "CBD5E1", fontFace: "Calibri",
            });
          });
        });
      }

      await pptx.writeFile({ fileName: `${currentDoc.title}.pptx` });
      onToast?.(`✅ Đã xuất file "${currentDoc.title}.pptx"`, "success");
    } catch (err) {
      console.error("PPTX export error:", err);
      onToast?.("❌ Xuất PowerPoint thất bại. Vui lòng thử lại.", "error");
    } finally {
      setIsExporting(null);
    }
  };

  // ── PDF Export (print-to-PDF via browser) ───────────────
  const exportToPDF = () => {
    onToast?.("🖨️ Đang mở hộp thoại in PDF... Chọn 'Lưu thành PDF'.", "info");
    setTimeout(() => window.print(), 200);
  };

  return {
    isExporting,
    exportToDOCX,
    exportToXLSX,
    exportToPPTX,
    exportToPDF,
  };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
