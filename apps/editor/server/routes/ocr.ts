import { Router, Request, Response } from "express";
import { generateContentWithFallback, formatGeminiError } from "../gemini";
import { tidyHtml } from "../htmlUtils";
import { validate } from "../middleware/validate";

const router = Router();
type LayoutHint = { text: string; x: number; y: number; w: number; h: number };

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildDigitalHtmlFromHints = (
  hints: LayoutHint[],
  pageWidth: number,
  pageHeight: number
) => {
  const baseWidth = Number.isFinite(pageWidth) && pageWidth > 0 ? pageWidth : 1280;
  const baseHeight = Number.isFinite(pageHeight) && pageHeight > 0 ? pageHeight : 1810;
  const sorted = [...hints].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  const blocks: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    lines: LayoutHint[];
  }> = [];

  for (const line of sorted) {
    const last = blocks[blocks.length - 1];
    if (!last) {
      blocks.push({ x: line.x, y: line.y, w: line.w, h: line.h, lines: [line] });
      continue;
    }

    const lastBottom = last.y + last.h;
    const lineBottom = line.y + line.h;
    const verticalGap = line.y - lastBottom;
    const sameColumn = Math.abs(line.x - last.x) <= 8 || (line.x >= last.x && line.x <= last.x + last.w + 4);
    const shouldMerge = verticalGap <= 2.8 && sameColumn && line.y <= lineBottom + 1;

    if (shouldMerge) {
      last.lines.push(line);
      const right = Math.max(last.x + last.w, line.x + line.w);
      const bottom = Math.max(lastBottom, lineBottom);
      last.x = Math.min(last.x, line.x);
      last.y = Math.min(last.y, line.y);
      last.w = right - last.x;
      last.h = bottom - last.y;
    } else {
      blocks.push({ x: line.x, y: line.y, w: line.w, h: line.h, lines: [line] });
    }
  }

  const minX = Math.min(...sorted.map((h) => h.x));
  const minY = Math.min(...sorted.map((h) => h.y));
  const normalizeX = (v: number) => Math.max(0, v - minX);
  const normalizeY = (v: number) => Math.max(0, v - minY);

  const rows = blocks.map((block) => {
    const xPx = (normalizeX(block.x) / 100) * baseWidth;
    const yPx = (normalizeY(block.y) / 100) * baseHeight;
    const wPx = (block.w / 100) * baseWidth;
    const hPx = (block.h / 100) * baseHeight;
    const lineHtml = block.lines
      .map((h) => {
    const xPx = (normalizeX(h.x) / 100) * baseWidth;
    const yPx = (normalizeY(h.y) / 100) * baseHeight;
    const wPx = (h.w / 100) * baseWidth;
    const hPx = (h.h / 100) * baseHeight;
    const fontSizePx = Math.max(11, Math.min(34, hPx * 0.92));
    const lineHeight = Math.max(1.15, Math.min(1.45, hPx / Math.max(1, fontSizePx)));
    const text = h.text.trim();

    const markerMatch = text.match(/^(F\s*[·•]\s*\d{1,3})\s+(.+)$/i);
    if (markerMatch) {
      const marker = escapeHtml(markerMatch[1]);
      const title = escapeHtml(markerMatch[2]);
      return `<div style="position:absolute;left:${(xPx - ((normalizeX(block.x) / 100) * baseWidth)).toFixed(
        2
      )}px;top:${(yPx - ((normalizeY(block.y) / 100) * baseHeight)).toFixed(2)}px;width:${wPx.toFixed(
        2
      )}px;white-space:nowrap;display:flex;gap:${Math.max(8, fontSizePx * 0.35).toFixed(1)}px;align-items:baseline;">
        <span style="font-size:${Math.max(12, fontSizePx * 0.5).toFixed(2)}px;line-height:1;color:#d64747;">${marker}</span>
        <span style="font-size:${Math.max(24, fontSizePx).toFixed(2)}px;line-height:1.2;font-weight:500;">${title}</span>
      </div>`;
    }

    return `<p style="position:absolute;left:${(xPx - ((normalizeX(block.x) / 100) * baseWidth)).toFixed(2)}px;top:${(
      yPx - ((normalizeY(block.y) / 100) * baseHeight)
    ).toFixed(2)}px;width:${wPx.toFixed(
      2
    )}px;margin:0;font-size:${fontSizePx.toFixed(2)}px;line-height:${lineHeight.toFixed(
      2
    )};white-space:pre-wrap;">${escapeHtml(text)}</p>`;
  })
      .join("");

    return `<section style="position:absolute;left:${xPx.toFixed(2)}px;top:${yPx.toFixed(
      2
    )}px;width:${wPx.toFixed(2)}px;min-height:${Math.max(16, hPx).toFixed(2)}px;">${lineHtml}</section>`;
  });

  return `<div class="digital-pdf-layer" style="position:relative;width:${baseWidth.toFixed(
    0
  )}px;min-height:${Math.max(900, ((100 - minY) / 100) * baseHeight).toFixed(0)}px;margin:0 auto;">${rows.join("")}</div>`;
};

const stabilizeNewStarHeroLayout = (html: string) => {
  if (!html.includes("A reference for building") || !html.includes("Operator Console v1")) return html;

  let stabilized = html;
  stabilized = stabilized.replace(
    /<h1\b[^>]*>[\s\S]*?<\/h1>/i,
    `<h1 style="font-size:62px;font-weight:400;line-height:1.08;letter-spacing:-0.5px;margin:8px 0 18px 0;max-width:980px;">
      <span style="display:block;">A reference for building</span>
      <span style="display:block;"><span style="color:#E04B5A;">NewStar</span></span>
      <span style="display:block;">Operator Console v1.</span>
    </h1>`
  );

  stabilized = stabilized.replace(
    /<table\b([^>]*)>/i,
    `<table$1 style="width:100%;table-layout:fixed;border-collapse:collapse;margin-top:28px;font-size:10px;letter-spacing:0.5px;">`
  );

  stabilized = stabilized.replace(/<th\b([^>]*)>/gi, `<th$1 style="text-align:left;vertical-align:top;width:25%;">`);
  stabilized = stabilized.replace(/<td\b([^>]*)>/gi, `<td$1 style="text-align:left;vertical-align:top;width:25%;">`);
  return stabilized;
};

router.post(
  "/convert-page",
  validate([
    { field: "imageBase64", type: "string", required: true, message: "Thiếu dữ liệu ảnh để OCR." },
    { field: "layoutHints", type: "array", max: 300 },
    { field: "isDigitalPdf", type: "boolean" },
    { field: "hasNonTextVisual", type: "boolean" },
    { field: "pageWidth", type: "number" },
    { field: "pageHeight", type: "number" },
    { field: "translateToVietnamese", type: "boolean" },
    { field: "useTailwindLayout", type: "boolean" },
  ]),
  async (req: Request, res: Response) => {
    try {
      const { imageBase64, layoutHints, isDigitalPdf, hasNonTextVisual, pageWidth, pageHeight, translateToVietnamese, useTailwindLayout } = req.body;
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      const normalizedHints = Array.isArray(layoutHints)
        ? layoutHints
            .filter((h: any) => h && typeof h.text === "string")
            .slice(0, 140)
            .map((h: any) => ({
              text: String(h.text).slice(0, 200),
              x: Number(h.x) || 0,
              y: Number(h.y) || 0,
              w: Number(h.w) || 0,
              h: Number(h.h) || 0,
            }))
        : [];

      const layoutHintsText = normalizedHints.length
        ? `\nTEXT LAYOUT HINTS (authoritative anchors from PDF text layer):\n${JSON.stringify(normalizedHints)}\nUse these anchors to preserve line breaks, block boundaries, and relative positions.`
        : "";

      const isTailwind = Boolean(useTailwindLayout);
      const isVietnamese = Boolean(translateToVietnamese);

      if (isDigitalPdf && normalizedHints.length > 0 && !hasNonTextVisual && !isTailwind) {
        const html = buildDigitalHtmlFromHints(normalizedHints, Number(pageWidth), Number(pageHeight));
        return res.json({ html });
      }

      const promptText = isTailwind
        ? `You are an expert web developer, slide designer, and OCR system.
You are given:
1. An image of a document page.
2. The exact text blocks extracted from that page (with coordinates [x0, y0, x1, y1]).

Your task is to convert this document page into a beautiful, clean, responsive HTML slide or section.
${isVietnamese ? "Translate all text on this page into natural, professional Vietnamese." : "Keep the original language of the text. Do NOT translate."}

CRITICAL DESIGN & LAYOUT INSTRUCTIONS:
- You MUST use Tailwind CSS for styling. The output should look modern, premium, and clean, inspired by the original design (e.g., color scheme, columns, structure).
- The slide container must be a single <div> element with class 'slide-container w-full h-full' and full Tailwind layout. Do NOT use 'min-h-screen', 'h-screen', 'min-w-screen', or 'w-screen' because the slide will be rendered inside a parent container with a fixed aspect ratio. Do NOT output <html>, <head>, or <body>.
- Do NOT output \`\`\`html markdown code block wrapper. Just output the raw HTML slide container.
- Font sizes: Use responsive Tailwind classes (e.g., text-3xl, text-lg). Ensure titles are prominent, body text is clear and readable.
- If the page has 2 or 3 columns, represent them using Tailwind flex/grid layout (e.g., grid grid-cols-1 md:grid-cols-2 gap-6).
- Colors: Mimic the original colors. For example, if it's a dark slide, use a dark background (like bg-[#0f0f14] or bg-[#121218]) and light text. If there are highlight colors (e.g. purple, blue, green), use similar Tailwind hex colors or standard colors.
- If there are images/screenshots/logos: since you cannot render images, represent them as a neat placeholder div, e.g. a card with an icon or a placeholder label "Ảnh chụp màn hình: [Mô tả]" or "Logo: [Mô tả]" in the output language, styled beautifully.
- Make sure all text is preserved or translated according to instructions, but keep product names, code snippets, and URLs in their original form.
- The output HTML should be highly readable, semantic, and clean.

Original Text Blocks:
${JSON.stringify(normalizedHints)}${layoutHintsText}`
        : `You are an expert web developer and OCR system.
Convert the provided image of a document page into clean, semantic HTML.
Preserve the layout, structure, headings, paragraphs, lists, and tables as closely as possible.
Use semantic HTML tags (<h1>, <p>, <ul>, <table>, etc.) and basic inline styles for alignment or layout to mimic the original document.
Keep original casing, punctuation, and line breaks. Do NOT rewrite text content.

LAYOUT PRESERVATION RULES:
- Preserve block order exactly from top-to-bottom and left-to-right.
- If TEXT LAYOUT HINTS are present, treat them as authoritative for text segmentation and relative placement.
- Never merge two separate visual text blocks into one element. Keep distinct lines/blocks as separate tags.
- If two consecutive title lines are visually separate, output as two separate heading/paragraph elements.
- Preserve typography metrics with inline styles when visible in the source (font-size, font-weight, line-height, letter-spacing, text-transform, text-align).
- Preserve spacing with inline styles (margin/padding) so vertical rhythm remains close to source.
- Horizontally Aligned Items: If multiple elements (such as two cards, or three icons, or separate logo/image blocks, or text columns) are arranged side-by-side in the same horizontal row, you MUST wrap ALL of those row elements together inside a SINGLE flexbox container (e.g. <div style="display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; justify-content: space-between; width: 100%;">). Never wrap a single card/placeholder in its own separate flexbox container if it is meant to be side-by-side with others.
- Explicit Widths for Row Children: You MUST assign explicit percentage-based widths via inline styles (e.g., style="width: 48%;" or style="width: 28%;") to each child inside that flexbox container so they can sit side-by-side. The sum of child widths plus gaps must not exceed 100%.
- Multiple Rows: If a page has multiple distinct rows of side-by-side items (e.g., Row 1 has 2 large cards, Row 2 has 3 small cards), you MUST create a separate flexbox container for each row. Do not put items from different rows into the same flexbox container.
- Columns & Tables: Explicitly set widths on table headers (<th>) and cells (<td>) to prevent awkward wrapping.

CRITICAL INSTRUCTIONS FOR IMAGE PLACEHOLDERS:
- Images, Logos, Icons, Brand Marks, and Charts: do not recreate them with plain text/CSS.
- Represent each with this exact placeholder:
<div class="crop-image-placeholder" data-x="[left%]" data-y="[top%]" data-w="[width%]" data-h="[height%]" style="width: [width%];" aria-label="[description]"></div>
- data-x/y/w/h must be percentage values in [0..100].

COORDINATE ESTIMATION RULES:
- Use unique and accurate bounding boxes for each image/chart.
- If multiple items are in one row, data-y should be similar and data-x should increase left-to-right.
- Do NOT merge multiple separate side-by-side logo variations or visual blocks (e.g. a black background logo next to a white background logo) into a single large placeholder. Treat each distinct variation or card as a separate block with its own placeholder and coordinates, and arrange them side-by-side using a flexbox container with percentage-based widths.
- Avoid over-segmentation only for a single isolated graphic. For grouped elements, prefer separating them if they serve as distinct visual cards or options.

Return ONLY raw HTML. Do not include markdown code fences, and do not include <html>, <head>, or <body>.${layoutHintsText}`;

      const response = await generateContentWithFallback({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: promptText,
              },
              {
                inlineData: {
                  data: base64Data,
                  mimeType: "image/jpeg",
                },
              },
            ],
          },
        ],
        config: {
          temperature: 0.2,
        },
      });

      let htmlContent = response.text || "";
      if (htmlContent.startsWith("```html")) {
        htmlContent = htmlContent.replace(/^```html\n?/, "");
        htmlContent = htmlContent.replace(/\n?```$/, "");
      }

      const finalHtmlClean = tidyHtml(stabilizeNewStarHeroLayout(htmlContent.trim()));
      return res.json({ html: finalHtmlClean });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      return res.status(500).json({ error: formatGeminiError(error) });
    }
  }
);

export default router;
