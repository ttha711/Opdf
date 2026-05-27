import { DocumentBlock, TableCell, AIParsedDocument } from "../types";
import { evaluateFormula } from "./formulaUtils";

// Compile standard JSON blocks into semantic rich-text Word Online editable HTML
export const compileBlocksToHtml = (blocks: DocumentBlock[]): string => {
  return blocks.map((block, idx) => {
    if (block.type === "heading") {
      const level = block.meta?.level || 1;
      let headingStyle = "font-sans font-bold tracking-tight text-slate-900 border-b border-slate-100 pb-1.5 mb-3";
      if (level === 1) headingStyle = "text-xl font-bold tracking-tight text-slate-900 mt-4 border-b border-slate-200 pb-2 mb-4 uppercase";
      if (level === 2) headingStyle = "text-lg font-semibold tracking-tight text-slate-800 mt-3 mb-2.5";
      if (level === 3) headingStyle = "text-base font-medium text-slate-755 mt-2 mb-2";
      return `<h${level} id="${block.id}" class="${headingStyle}" data-block-id="${block.id}">${block.content}</h${level}>`;
    } 
    
    if (block.type === "paragraph") {
      let paraHtml = `<p id="${block.id}" class="text-xs text-slate-650 leading-relaxed mb-3 text-justify" data-block-id="${block.id}">${block.content}</p>`;
      if (block.meta?.bulletPoints && block.meta.bulletPoints.length > 0) {
        paraHtml += `<ul class="list-disc pl-5 text-xs text-slate-650 space-y-1.5 my-2">` + 
          block.meta.bulletPoints.map(bp => `<li>${bp}</li>`).join("") + 
          `</ul>`;
      }
      return paraHtml;
    } 
    
    if (block.type === "callout") {
      const type = block.meta?.calloutType || "info";
      let callStyle = "bg-indigo-50 border-indigo-400 text-indigo-800";
      if (type === "warning") callStyle = "bg-amber-50 border-amber-400 text-amber-800";
      if (type === "success") callStyle = "bg-emerald-50 border-emerald-400 text-emerald-800";
      if (type === "danger") callStyle = "bg-red-50 border-red-400 text-red-800";
      
      return `<div id="${block.id}" class="p-3 my-3.5 border-l-4 rounded-r-md text-[11px] font-medium leading-relaxed ${callStyle}" data-block-id="${block.id}" data-type="callout" data-callout-type="${type}">💡 ${block.content}</div>`;
    } 
    
    if (block.type === "table" && block.tableData) {
      let tHtml = `<table id="${block.id}" class="w-full my-4 text-[11px] text-zinc-800 text-left border-collapse border border-zinc-200 animate-fade-in" data-block-id="${block.id}" aria-label="${block.content}">`;
      tHtml += `<thead>`;
      block.tableData.forEach((row, rIdx) => {
        if (rIdx === 0) {
          tHtml += `<tr class="bg-zinc-50 font-bold border-b border-zinc-300">`;
          row.forEach(cell => {
            tHtml += `<th class="border border-zinc-200 p-2 text-center font-bold" data-formula="${cell.formula || ''}">${cell.value}</th>`;
          });
          tHtml += `</tr></thead><tbody>`;
        } else {
          tHtml += `<tr class="border-b border-zinc-150">`;
          row.forEach(cell => {
            const disp = cell.formula ? evaluateFormula(cell.formula, block.tableData!) : cell.value;
            tHtml += `<td class="border border-zinc-200 p-2 text-center animate-pulse" data-val="${cell.value}" data-formula="${cell.formula || ''}">${disp}</td>`;
          });
          tHtml += `</tr>`;
        }
      });
      tHtml += `</tbody></table>`;
      return tHtml;
    } 
    
    if (block.type === "page-break") {
      return `<div id="${block.id}" class="page-break-divider border-t-2 border-dashed border-indigo-200 text-center py-2.5 my-6 select-none print:hidden font-sans" data-block-id="${block.id}" style="page-break-before: always;">
        <span class="bg-indigo-50 text-indigo-750 text-[9px] font-bold px-3 py-0.5 rounded-full border border-indigo-120 uppercase tracking-widest leading-none">Ngắt trang vật lý (Page Cut)</span>
      </div>`;
    }
    
    return "";
  }).join("\n");
};

// Traverses and parses editor HTML nodes back into standard AIParsedDocument blocks structure
export const parseHtmlToBlocks = (html: string): DocumentBlock[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const foundBlocks: DocumentBlock[] = [];
  
  const children = Array.from(doc.body.children);
  children.forEach((child, idx) => {
    const tag = child.tagName.toLowerCase();
    const id = child.id || `b_wp_${Date.now()}_${idx}`;
    
    if (/^h[1-3]$/.test(tag)) {
      const level = parseInt(tag.substring(1)) as 1 | 2 | 3;
      foundBlocks.push({
        id,
        type: "heading",
        content: child.textContent || "",
        meta: { level }
      });
    } 
    else if (tag === "table") {
      const rows: TableCell[][] = [];
      const trs = child.querySelectorAll("tr");
      trs.forEach(tr => {
        const rowData: TableCell[] = [];
        const cells = tr.querySelectorAll("th, td");
        cells.forEach(cell => {
          const rawVal = cell.getAttribute("data-val") || cell.textContent || "";
          const form = cell.getAttribute("data-formula") || undefined;
          rowData.push({ value: rawVal, formula: form || undefined });
        });
        if (rowData.length > 0) rows.push(rowData);
      });
      foundBlocks.push({
        id,
        type: "table",
        content: child.getAttribute("aria-label") || "Bảng số liệu",
        tableData: rows.length > 0 ? rows : undefined
      });
    } 
    else if (tag === "div" && (child.classList.contains("border-l-4") || child.getAttribute("data-type") === "callout")) {
      const callType = (child.getAttribute("data-callout-type") || "info") as any;
      foundBlocks.push({
        id,
        type: "callout",
        content: child.textContent?.replace(/^💡\s*/, "") || "",
        meta: { calloutType: callType }
      });
    } 
    else if (tag === "div" && (child.classList.contains("page-break-divider") || child.getAttribute("style")?.includes("page-break"))) {
      foundBlocks.push({
        id,
        type: "page-break",
        content: ""
      });
    } 
    else if (tag === "ul" || tag === "ol") {
      const bullets: string[] = [];
      child.querySelectorAll("li").forEach(li => {
        bullets.push(li.textContent || "");
      });
      if (foundBlocks.length > 0 && foundBlocks[foundBlocks.length - 1].type === "paragraph") {
        const prev = foundBlocks[foundBlocks.length - 1];
        prev.meta = { ...prev.meta, bulletPoints: bullets };
      } else {
        foundBlocks.push({
          id,
          type: "paragraph",
          content: "",
          meta: { bulletPoints: bullets }
        });
      }
    } 
    else {
      // Normal paragraph (p or others)
      const bullets: string[] = [];
      const lis = child.querySelectorAll("li");
      if (lis.length > 0) {
        lis.forEach(li => bullets.push(li.textContent || ""));
      }
      
      foundBlocks.push({
        id,
        type: "paragraph",
        content: child.textContent || "",
        meta: bullets.length > 0 ? { bulletPoints: bullets } : undefined
      });
    }
  });
  
  return foundBlocks;
};

// Escape XML character entities to prevent XML parsing format failures
export const escapeXMLEntities = (str: string) => {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

// Structured Block Document Semantic XML Exporter
export const exportToXML = (currentDoc: AIParsedDocument) => {
  try {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<AIParsedDocument>\n`;
    xml += `  <Title>${escapeXMLEntities(currentDoc.title || "")}</Title>\n`;
    xml += `  <Description>${escapeXMLEntities(currentDoc.description || "")}</Description>\n`;
    xml += `  <Theme>${escapeXMLEntities(currentDoc.theme || "")}</Theme>\n`;
    xml += `  <Blocks>\n`;

    currentDoc.blocks.forEach(block => {
      xml += `    <Block type="${escapeXMLEntities(block.type)}">\n`;
      xml += `      <Id>${escapeXMLEntities(block.id)}</Id>\n`;
      xml += `      <Content>${escapeXMLEntities(block.content)}</Content>\n`;
      
      if (block.meta) {
        xml += `      <Meta>\n`;
        if (block.meta.level) xml += `        <Level>${block.meta.level}</Level>\n`;
        if (block.meta.calloutType) xml += `        <CalloutType>${escapeXMLEntities(block.meta.calloutType)}</CalloutType>\n`;
        if (block.meta.slideBg) xml += `        <SlideBg>${escapeXMLEntities(block.meta.slideBg)}</SlideBg>\n`;
        if (block.meta.chartType) xml += `        <ChartType>${escapeXMLEntities(block.meta.chartType)}</ChartType>\n`;
        
        if (block.meta.chartDataKeys) {
          xml += `        <ChartDataKeys>\n`;
          block.meta.chartDataKeys.forEach(key => {
            xml += `          <Key>${escapeXMLEntities(key)}</Key>\n`;
          });
          xml += `        </ChartDataKeys>\n`;
        }

        if (block.meta.bulletPoints) {
          xml += `        <BulletPoints>\n`;
          block.meta.bulletPoints.forEach(bp => {
            xml += `          <Bullet>${escapeXMLEntities(bp)}</Bullet>\n`;
          });
          xml += `        </BulletPoints>\n`;
        }
        xml += `      </Meta>\n`;
      }

      if (block.tableData) {
        xml += `      <TableData>\n`;
        block.tableData.forEach((row, rIdx) => {
          xml += `        <Row index="${rIdx}">\n`;
          row.forEach((cell, cIdx) => {
            xml += `          <Cell index="${cIdx}">\n`;
            xml += `            <Value>${escapeXMLEntities(cell.value)}</Value>\n`;
            if (cell.formula) {
              xml += `            <Formula>${escapeXMLEntities(cell.formula)}</Formula>\n`;
            }
            xml += `          </Cell>\n`;
          });
          xml += `        </Row>\n`;
        });
        xml += `      </TableData>\n`;
      }

      xml += `    </Block>\n`;
    });

    xml += `  </Blocks>\n`;
    xml += `</AIParsedDocument>\n`;

    const blob = new Blob([xml], { type: "application/xml;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentDoc.title || "document"}_structured_model.xml`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Xuất XML gặp lỗi.");
  }
};
