import { DocumentBlock, TableCell } from "../types";

export const parseHtmlToBlocks = (htmlStr: string): DocumentBlock[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlStr, "text/html");
  const extractedBlocks: DocumentBlock[] = [];
  let bCounter = 1;

  const nextId = () => `b_imported_${bCounter++}`;

  const extract = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      extractedBlocks.push({
        id: nextId(),
        type: "heading",
        content: el.textContent?.trim() || "",
        meta: { level: tag === "h1" ? 1 : tag === "h2" ? 2 : 3 }
      });
    } else if (tag === "p" || tag === "ul" || tag === "ol") {
      const bulletPoints: string[] = [];
      if (tag === "ul" || tag === "ol") {
        el.querySelectorAll("li").forEach(li => {
          const txt = li.textContent?.trim();
          if (txt) bulletPoints.push(txt);
        });
      }
      extractedBlocks.push({
        id: nextId(),
        type: "paragraph",
        content: tag === "p" ? el.innerHTML.trim() : "",
        meta: bulletPoints.length > 0 ? { bulletPoints } : undefined
      });
    } else if (tag === "table") {
      const rows = el.querySelectorAll("tr");
      const grid: TableCell[][] = [];
      rows.forEach(tr => {
        const cells = tr.querySelectorAll("th, td");
        const rowCells: TableCell[] = [];
        cells.forEach(cell => {
          rowCells.push({ value: cell.textContent?.trim() || "" });
        });
        if (rowCells.length > 0) grid.push(rowCells);
      });

      if (grid.length > 0) {
        extractedBlocks.push({
          id: nextId(),
          type: "table",
          content: "Bảng dữ liệu Excel trích xuất",
          tableData: grid
        });
        extractedBlocks.push({
          id: nextId(),
          type: "chart",
          content: "Biểu đồ thông số",
          meta: { chartType: "bar", chartDataKeys: ["Quý", "Thống kê"] }
        });
      }
    } else if (tag === "div" && el.classList.contains("crop-image-placeholder")) {
      extractedBlocks.push({
        id: nextId(),
        type: "callout",
        content: `[Ảnh tư liệu phục hồi]: ${el.getAttribute("aria-label") || "Hình minh hoạ"}`,
        meta: { calloutType: "info" }
      });
    } else {
      Array.from(el.children).forEach(child => extract(child));
    }
  };

  Array.from(doc.body.children).forEach(child => extract(child));

  if (extractedBlocks.length === 0) {
    extractedBlocks.push({
      id: nextId(),
      type: "paragraph",
      content: doc.body.textContent?.trim() || "Nội dung phục hồi trống."
    });
  }

  return extractedBlocks;
};
