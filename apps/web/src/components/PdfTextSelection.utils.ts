import type { RenderedTextItem } from "./PdfViewer.types";
import type { GroupedLine } from "./PdfTextSelection.types";

export interface NormalizedSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeSelectionRects(
  rects: DOMRect[],
  containerRect: DOMRect,
  pageWidth: number,
  pageHeight: number
): NormalizedSelectionRect[] {
  return rects
    .map((rect) => {
      const left = clamp(rect.left - containerRect.left, 0, pageWidth);
      const top = clamp(rect.top - containerRect.top, 0, pageHeight);
      const right = clamp(rect.right - containerRect.left, 0, pageWidth);
      const bottom = clamp(rect.bottom - containerRect.top, 0, pageHeight);
      return {
        x: left / pageWidth,
        y: top / pageHeight,
        width: Math.max(0, right - left) / pageWidth,
        height: Math.max(0, bottom - top) / pageHeight,
      };
    })
    .filter((rect) => rect.width > 0.001 && rect.height > 0.001);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function joinMatchedItems(items: RenderedTextItem[]): string {
  if (items.length === 0) return "";

  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.top - b.top) > 5) {
      return a.top - b.top;
    }
    return a.left - b.left;
  });

  const lineThreshold = Math.max(
    4,
    Math.min(12, Math.round(sorted.reduce((sum, item) => sum + item.height, 0) / sorted.length * 0.5)),
  );

  const lines: RenderedTextItem[][] = [];
  for (const item of sorted) {
    const currentLine = lines[lines.length - 1];
    if (!currentLine || Math.abs(item.top - currentLine[0].top) > lineThreshold) {
      lines.push([item]);
    } else {
      currentLine.push(item);
    }
  }

  return lines
    .map((line) => {
      return joinTextItemsInOrder(line);
    })
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function joinTextItemsInOrder(items: RenderedTextItem[]): string {
  const pieces: string[] = [];
  const ordered = [...items].sort((a, b) => a.left - b.left);
  for (const item of ordered) {
    appendItemText(pieces, item.str);
  }
  return pieces.join("");
}

export function groupTextItemsIntoLines(items: RenderedTextItem[]): GroupedLine[] {
  if (items.length === 0) return [];

  const sortedItems = [...items].sort((a, b) => {
    if (Math.abs(a.top - b.top) > 5) {
      return a.top - b.top;
    }
    return a.left - b.left;
  });

  const lines: GroupedLine[] = [];
  let currentLine: GroupedLine | null = null;

  for (const item of sortedItems) {
    if (!item.str.trim()) continue;

    if (!currentLine) {
      currentLine = {
        str: item.str,
        left: item.left,
        top: item.top,
        width: item.width,
        height: item.height,
        fontSize: item.fontSize,
        items: [item],
      };
      continue;
    }

    const sameRow = Math.abs(item.top - currentLine.top) <= 6;
    const prevItem = currentLine.items[currentLine.items.length - 1];
    const spacingX = item.left - (prevItem.left + prevItem.width);
    const isCloseX = spacingX < item.fontSize * 2.0;

    if (sameRow && isCloseX) {
      currentLine.width = (item.left + item.width) - currentLine.left;
      currentLine.height = Math.max(currentLine.height, item.height);
      currentLine.fontSize = Math.max(currentLine.fontSize, item.fontSize);
      currentLine.items.push(item);
      currentLine.str = joinTextItemsInOrder(currentLine.items);
    } else {
      lines.push(currentLine);
      currentLine = {
        str: item.str,
        left: item.left,
        top: item.top,
        width: item.width,
        height: item.height,
        fontSize: item.fontSize,
        items: [item],
      };
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function appendItemText(parts: string[], text: string) {
  const value = text.trim();
  if (!value) return;

  if (parts.length === 0) {
    parts.push(value);
    return;
  }

  const prev = parts[parts.length - 1];
  const prevEndsWithJoiner = /[-–—\/]$/.test(prev);
  const currIsJoiner = /^[-–—\/]$/.test(value);
  const prevEndsWithOpenPunctuation = /[\(\[\{]$/.test(prev);
  const currStartsWithClosePunctuation = /^[\)\]\},.;:!?%]/.test(value);
  const shouldAddSpace =
    !prevEndsWithJoiner &&
    !currIsJoiner &&
    !prevEndsWithOpenPunctuation &&
    !currStartsWithClosePunctuation;

  parts.push(shouldAddSpace ? ` ${value}` : value);
}
