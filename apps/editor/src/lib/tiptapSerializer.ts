import type { DocumentBlock, TableCell, AIParsedDocument } from "../types";
import type { JSONContent } from "@tiptap/react";

/**
 * Convert DocumentBlock[] to ProseMirror JSON (TipTap editor format).
 */
export function blocksToProseMirror(blocks: DocumentBlock[]): JSONContent {
  const doc: JSONContent = { type: "doc", content: [] };

  for (const block of blocks) {
    const node = blockToProseMirrorNode(block);
    if (node) {
      doc.content!.push(node);
    }
  }

  return doc;
}

function blockToProseMirrorNode(block: DocumentBlock): JSONContent | null {
  const { type, content, meta, tableData } = block;

  switch (type) {
    case "heading":
      return {
        type: "heading",
        attrs: { level: meta?.level || 2 },
        content: htmlToProseMirrorContent(content),
      };

    case "paragraph":
      return {
        type: "paragraph",
        content: htmlToProseMirrorContent(content),
      };

    case "table":
      if (tableData && tableData.length > 0) {
        return {
          type: "table",
          content: tableData.map((row) => ({
            type: "tableRow",
            content: row.map((cell) => ({
              type: "tableCell",
              content: cellTextToContent(cell),
            })),
          })),
        };
      }
      return {
        type: "paragraph",
        content: [{ type: "text", text: content || "Bảng trống" }],
      };

    case "callout":
      return {
        type: "blockquote",
        content: htmlToProseMirrorContent(content),
      };

    case "image":
      return {
        type: "image",
        attrs: {
          src: meta?.imageSrc || "",
          alt: meta?.imageAlt || "",
          title: meta?.imageAlt || "",
        },
      };

    case "divider":
      return { type: "horizontalRule" };

    case "page-break":
      return {
        type: "paragraph",
        content: [{ type: "text", text: "" }],
      };

    case "chart":
    case "slide":
      return {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `[${type === "chart" ? "Biểu đồ" : "Slide"}: ${content || ""}]`,
          },
        ],
      };

    default:
      return {
        type: "paragraph",
        content: htmlToProseMirrorContent(content),
      };
  }
}

function htmlToProseMirrorContent(html: string): JSONContent[] {
  if (!html || html.trim() === "") {
    return [{ type: "text", text: "" }];
  }

  // If it's plain text (no HTML tags), return as simple text
  if (!/<[^>]*>/.test(html)) {
    return html.split("\n").flatMap((line, i, arr) => {
      const nodes: JSONContent[] = [{ type: "text", text: line }];
      if (i < arr.length - 1) nodes.push({ type: "hardBreak" });
      return nodes;
    });
  }

  // For HTML content, parse simple formatting into ProseMirror marks
  return parseSimpleHtmlToContent(html);
}

function parseSimpleHtmlToContent(html: string): JSONContent[] {
  const result: JSONContent[] = [];
  // Strip wrapping <p> tags
  let inner = html.replace(/^<p[^>]*>/i, "").replace(/<\/p>\s*$/i, "");

  // Replace <br> and </p><p> with hard breaks
  inner = inner.replace(/<br\s*\/?>/gi, "\n");
  inner = inner.replace(/<\/p>\s*<p[^>]*>/gi, "\n");

  // Remove remaining HTML tags and extract text
  const text = inner.replace(/<[^>]*>/g, "");

  if (text.includes("\n")) {
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (line) result.push({ type: "text", text: line });
      if (i < lines.length - 1) result.push({ type: "hardBreak" });
    });
  } else {
    result.push({ type: "text", text });
  }

  return result.length > 0 ? result : [{ type: "text", text: "" }];
}

function cellTextToContent(cell: TableCell): JSONContent[] {
  const text = cell.value || "";
  const marks: any[] = [];

  if (cell.bold) marks.push({ type: "bold" });
  if (cell.italic) marks.push({ type: "italic" });

  if (cell.formula) {
    return [{ type: "text", text: `${text} (${cell.formula})`, marks }];
  }

  return [{ type: "text", text, marks }];
}

/**
 * Convert ProseMirror JSON back to DocumentBlock[].
 */
export function proseMirrorToBlocks(doc: JSONContent): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  if (!doc.content) return blocks;

  let blockCounter = 0;

  for (const node of doc.content) {
    blockCounter++;
    const block = proseMirrorNodeToBlock(node, blockCounter);
    if (block) blocks.push(block);
  }

  return blocks;
}

function proseMirrorNodeToBlock(node: JSONContent, counter: number): DocumentBlock | null {
  const id = `b_tiptap_${counter}_${Date.now()}`;

  switch (node.type) {
    case "heading":
      return {
        id,
        type: "heading",
        content: contentToText(node.content),
        meta: { level: (node.attrs?.level as 1 | 2 | 3) || 2 },
      };

    case "paragraph":
      return {
        id,
        type: "paragraph",
        content: contentToText(node.content),
      };

    case "blockquote":
      return {
        id,
        type: "callout",
        content: contentToText(node.content),
        meta: { calloutType: "info" },
      };

    case "table":
      return {
        id,
        type: "table",
        content: "Bảng dữ liệu",
        tableData: (node.content || []).map((row) =>
          (row.content || []).map((cell) => ({
            value: contentToText(cell.content),
          }))
        ),
      };

    case "image":
      return {
        id,
        type: "image",
        content: node.attrs?.alt || "",
        meta: {
          imageSrc: node.attrs?.src || "",
          imageAlt: node.attrs?.alt || "",
        },
      };

    case "horizontalRule":
      return {
        id,
        type: "divider",
        content: "",
      };

    case "bulletList":
    case "orderedList":
    case "taskList":
      return {
        id,
        type: "paragraph",
        content: contentToText(node.content),
      };

    default:
      if (node.content) {
        return {
          id,
          type: "paragraph",
          content: contentToText(node.content),
        };
      }
      return null;
  }
}

function contentToText(content?: JSONContent[]): string {
  if (!content || content.length === 0) return "";

  return content
    .map((node) => {
      if (node.type === "text") return node.text || "";
      if (node.type === "hardBreak") return "\n";
      if (node.type === "image") return `[Ảnh: ${node.attrs?.alt || ""}]`;
      if (node.content) return contentToText(node.content);
      return "";
    })
    .join("");
}
