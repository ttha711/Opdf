import type { EditorBlock } from "./types";

const normalizeText = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export function htmlToBlocks(html: string): EditorBlock[] {
  if (typeof window === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks: EditorBlock[] = [];
  let index = 0;
  for (const node of Array.from(doc.body.children)) {
    const tag = node.tagName.toLowerCase();
    const rawHtml = node.outerHTML;
    const text = normalizeText(rawHtml);
    const id = `block_${index + 1}`;
    index += 1;
    if (!text && tag !== "img" && tag !== "table") continue;
    const commonStyle = { font: "Noto Sans", size: 12, color: "#111827", lineHeight: 1.5 };
    if (tag.match(/^h[1-6]$/)) {
      blocks.push({ id, type: "heading", content: text, html: rawHtml, style: { ...commonStyle, size: 16 } });
    } else if (tag === "ul" || tag === "ol") {
      blocks.push({ id, type: "list", content: text, html: rawHtml, style: { ...commonStyle, size: 11 } });
    } else if (tag === "table") {
      blocks.push({ id, type: "table", content: text || "Table block", html: rawHtml, style: commonStyle });
    } else if (tag === "img") {
      blocks.push({ id, type: "image", content: node.getAttribute("alt") || "Image", html: rawHtml, style: commonStyle });
    } else {
      blocks.push({ id, type: "paragraph", content: text, html: rawHtml, style: commonStyle });
    }
  }
  return blocks;
}

export function blocksToHtml(blocks: EditorBlock[]): string {
  const body = blocks.map((b) => b.html).join("\n");
  return `<!doctype html><html><head><meta charset="UTF-8"><title>OPDF Live Editor</title></head><body>${body}</body></html>`;
}
