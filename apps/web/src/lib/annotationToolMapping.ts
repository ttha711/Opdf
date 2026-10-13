import type { ActiveTool } from "./app-types";

export function mapActiveToolToEmbedPdfAnnotation(activeTool?: ActiveTool | string): string | null {
  switch (activeTool) {
    case "highlight":
      return "highlight";
    case "underline":
      return "underline";
    case "strike":
      return "strikeout";
    case "shape":
      return "square";
    case "note":
      return "text";
    case "text":
      return "freeText";
    case "draw":
      return "ink";
    default:
      return null;
  }
}


export function isEmbedPdfReplaceTextTool(rawTool: unknown) {
  const normalized = String(rawTool ?? "").trim().toLowerCase();
  return normalized.includes("replace-text") || normalized.includes("replacetext");
}

/** Normalize tool picks made inside the embedded viewer toolbar. */
export function mapEmbedPdfToolToActiveTool(raw: unknown): ActiveTool | null {
  const tool = String(raw ?? "").trim().toLowerCase().split(":").pop() ?? "";
  if (tool === "" || tool === "none" || tool === "select") return "select";
  if (tool.includes("highlight")) return "highlight";
  if (tool.includes("freetext") || tool.includes("free-text")) return "text";
  if (tool === "text" || tool.includes("note")) return "note";
  if (tool.includes("ink") || tool.includes("draw")) return "draw";
  if (tool === "square" || tool.includes("rectangle") || tool === "circle" ||
      tool === "line" || tool === "arrow" || tool === "polygon" || tool === "polyline") return "shape";
  if (tool.includes("redact")) return "redact";
  return null;
}
