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
