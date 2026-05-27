import { z } from "zod";

export const AIParsedDocumentSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  theme: z.enum(["corporate", "minimalist", "warm", "modern"]),
  blocks: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(["heading", "paragraph", "table", "chart", "callout", "slide", "page-break", "image", "divider"]),
    content: z.string(),
    meta: z.object({
      level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      style: z.string().optional(),
      chartType: z.enum(["bar", "line", "pie", "area"]).optional(),
      chartDataKeys: z.array(z.string()).optional(),
      calloutType: z.enum(["info", "warning", "success", "danger"]).optional(),
      bulletPoints: z.array(z.string()).optional(),
      slideBg: z.string().optional(),
      layout: z.enum(["title", "bullets", "two-columns", "quote", "image-left", "image-right", "blank"]).optional(),
      imageSrc: z.string().optional(),
      imageAlt: z.string().optional(),
      imageWidth: z.string().optional(),
      slideNotes: z.string().optional(),
      hasHeaderRow: z.boolean().optional(),
      frozenHeader: z.boolean().optional(),
      stripeRows: z.boolean().optional(),
      tableStyle: z.enum(["default", "blue", "green", "orange", "red", "minimal"]).optional(),
    }).optional(),
    tableData: z.array(z.array(z.object({
      value: z.string(),
      formula: z.string().optional(),
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      align: z.enum(["left", "center", "right"]).optional(),
      bgColor: z.string().optional(),
      color: z.string().optional(),
      merged: z.boolean().optional(),
      colSpan: z.number().optional(),
      rowSpan: z.number().optional(),
    }))).optional(),
    grammarErrors: z.array(z.object({
      text: z.string(),
      suggestion: z.string(),
      type: z.enum(["grammar", "spelling", "style"]),
      start: z.number(),
      end: z.number(),
    })).optional(),
  })),
  comments: z.array(z.object({
    id: z.string(),
    blockId: z.string(),
    anchorText: z.string(),
    comment: z.string(),
    author: z.string().optional(),
    createdAt: z.string(),
    resolved: z.boolean().optional(),
  })).optional(),
});

export function validateAndParseAIResponse(text: string): { success: true; data: any } | { success: false; error: string } {
  try {
    // Clean markdown wraps
    let cleaned = text.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(cleaned);
    const result = AIParsedDocumentSchema.safeParse(parsed);

    if (result.success) {
      return { success: true, data: result.data };
    }

    return {
      success: false,
      error: `AI response validation failed: ${result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    };
  } catch (e: any) {
    return { success: false, error: `JSON parse error: ${e.message}` };
  }
}

export const EditHTMLResponseSchema = z.object({
  html: z.string().min(1),
  original: z.string(),
  changes: z.array(z.object({
    type: z.enum(["insertion", "deletion", "modification"]),
    before: z.string(),
    after: z.string(),
    description: z.string(),
  })).optional(),
});
