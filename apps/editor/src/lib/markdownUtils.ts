import type { DocumentBlock, AIParsedDocument } from "../types";

/**
 * Convert DocumentBlock[] to Markdown string.
 */
export function blocksToMarkdown(blocks: DocumentBlock[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        const level = block.meta?.level || 2;
        lines.push(`${"#".repeat(level)} ${stripHtml(block.content)}`);
        lines.push("");
        break;

      case "paragraph":
        lines.push(stripHtml(block.content));
        lines.push("");
        break;

      case "table":
        if (block.tableData && block.tableData.length > 0) {
          const headerRow = block.tableData[0];
          lines.push("| " + headerRow.map((c) => c.value || "").join(" | ") + " |");
          lines.push("| " + headerRow.map(() => "---").join(" | ") + " |");
          for (let i = 1; i < block.tableData.length; i++) {
            lines.push("| " + block.tableData[i].map((c) => c.value || "").join(" | ") + " |");
          }
          lines.push("");
        }
        break;

      case "callout":
        const calloutType = block.meta?.calloutType || "info";
        const emoji = { info: "ℹ️", warning: "⚠️", success: "✅", danger: "🚨" }[calloutType] || "💡";
        lines.push(`> ${emoji} **Lưu ý:** ${stripHtml(block.content)}`);
        lines.push("");
        break;

      case "image":
        lines.push(`![${block.meta?.imageAlt || ""}](${block.meta?.imageSrc || ""})`);
        lines.push("");
        break;

      case "divider":
        lines.push("---");
        lines.push("");
        break;

      case "page-break":
        lines.push("");
        lines.push("---");
        lines.push("");
        break;

      case "chart":
      case "slide":
        lines.push(`> *[${block.type === "chart" ? "Biểu đồ" : "Slide"}: ${stripHtml(block.content)}]*`);
        lines.push("");
        break;
    }
  }

  return lines.join("\n");
}

/**
 * Parse Markdown string to DocumentBlock[].
 */
export function markdownToBlocks(markdown: string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const lines = markdown.split("\n");
  let counter = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (!line.trim()) {
      i++;
      continue;
    }

    counter++;

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 3) as 1 | 2 | 3;
      blocks.push({
        id: `b_md_h${counter}_${Date.now()}`,
        type: "heading",
        content: headingMatch[2],
        meta: { level },
      });
      i++;
      continue;
    }

    // Horizontal rule / page break
    if (/^---+$/.test(line.trim())) {
      if (blocks.length > 0 && blocks[blocks.length - 1].type !== "divider") {
        blocks.push({
          id: `b_md_hr${counter}_${Date.now()}`,
          type: "page-break",
          content: "",
        });
      }
      i++;
      continue;
    }

    // Blockquote (callout)
    if (line.startsWith("> ")) {
      let content = "";
      while (i < lines.length && lines[i].startsWith("> ")) {
        content += lines[i].replace(/^> /, "") + "\n";
        i++;
      }
      blocks.push({
        id: `b_md_c${counter}_${Date.now()}`,
        type: "callout",
        content: content.trim(),
        meta: { calloutType: "info" },
      });
      continue;
    }

    // Table
    if (line.startsWith("|") && line.endsWith("|")) {
      const headerCells = line.split("|").filter((c) => c.trim()).map((c) => ({ value: c.trim() }));
      i++; // Skip separator row if present
      if (i < lines.length && lines[i].includes("---")) i++;

      const tableData = [headerCells];
      while (i < lines.length && lines[i].startsWith("|") && lines[i].endsWith("|")) {
        const cells = lines[i].split("|").filter((c) => c.trim()).map((c) => ({ value: c.trim() }));
        tableData.push(cells);
        i++;
      }

      blocks.push({
        id: `b_md_t${counter}_${Date.now()}`,
        type: "table",
        content: "Bảng dữ liệu",
        tableData,
      });
      continue;
    }

    // Image
    const imageMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (imageMatch) {
      blocks.push({
        id: `b_md_img${counter}_${Date.now()}`,
        type: "image",
        content: imageMatch[1],
        meta: { imageSrc: imageMatch[2], imageAlt: imageMatch[1] },
      });
      i++;
      continue;
    }

    // Regular paragraph - collect consecutive lines
    let paraContent = "";
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith(">") && !lines[i].startsWith("|") && !lines[i].match(/!\[/) && !lines[i].match(/^---+$/)) {
      paraContent += (paraContent ? "\n" : "") + lines[i];
      i++;
    }

    if (paraContent.trim()) {
      blocks.push({
        id: `b_md_p${counter}_${Date.now()}`,
        type: "paragraph",
        content: paraContent.trim(),
      });
    } else {
      i++;
    }
  }

  return blocks;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}
