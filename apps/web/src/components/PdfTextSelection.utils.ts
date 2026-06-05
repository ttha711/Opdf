import type { RenderedTextItem } from "./PdfViewer.types";
import type { GroupedLine } from "./PdfTextSelection.types";

/**
 * Sort text items into visual reading order.
 * Detects multi-column layout by finding large horizontal gaps, then renders
 * each column group top-to-bottom before moving to the next group.
 * This keeps browser selection aligned with the visible column order.
 */
export function sortItemsInReadingOrder(items: RenderedTextItem[]): RenderedTextItem[] {
  if (items.length < 2) return items;

  type VisualLine = {
    items: RenderedTextItem[];
    left: number;
    top: number;
    right: number;
    height: number;
  };

  const rows: RenderedTextItem[][] = [];
  for (const item of [...items].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const row = rows.find((candidate) => Math.abs(candidate[0].top - item.top) <= 5);
    if (row) {
      row.push(item);
    } else {
      rows.push([item]);
    }
  }

  const lines: VisualLine[] = [];
  for (const row of rows) {
    let current: RenderedTextItem[] = [];
    for (const item of row.sort((a, b) => a.left - b.left)) {
      const previous = current[current.length - 1];
      const gap = previous ? item.left - (previous.left + previous.width) : 0;
      const joinThreshold = previous ? Math.max(previous.fontSize, item.fontSize) * 2 : 0;
      if (previous && gap >= joinThreshold) {
        lines.push(toVisualLine(current));
        current = [];
      }
      current.push(item);
    }
    if (current.length > 0) {
      lines.push(toVisualLine(current));
    }
  }

  const contentLeft = Math.min(...lines.map((line) => line.left));
  const contentRight = Math.max(...lines.map((line) => line.right));
  const columnThreshold = Math.max(60, (contentRight - contentLeft) * 0.12);
  const starts = [...new Set(lines.map((line) => Math.round(line.left)))].sort((a, b) => a - b);
  const boundaries = starts
    .slice(1)
    .map((start, index) => ({ left: starts[index], right: start }))
    .filter(({ left, right }) => right - left > columnThreshold)
    .map(({ left, right }) => {
      const provisionalBoundary = (left + right) / 2;
      const leftEdges = lines
        .filter((line) => line.left < provisionalBoundary && line.right < right)
        .map((line) => line.right);
      const rightEdges = lines
        .filter((line) => line.left >= right)
        .map((line) => line.left);
      const leftEdge = leftEdges.length > 0 ? Math.max(...leftEdges) : left;
      const rightEdge = rightEdges.length > 0 ? Math.min(...rightEdges) : right;
      return (leftEdge + rightEdge) / 2;
    })
    .filter((boundary) => {
      const leftLines = lines.filter((line) => line.right <= boundary).length;
      const rightLines = lines.filter((line) => line.left >= boundary).length;
      return leftLines >= 2 && rightLines >= 2;
    });

  if (boundaries.length === 0) {
    return lines
      .sort((a, b) => a.top - b.top || a.left - b.left)
      .flatMap((line) => line.items);
  }

  const spanning = lines
    .filter((line) => boundaries.some((boundary) => line.left < boundary && line.right > boundary))
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const remaining = lines.filter((line) => !spanning.includes(line));
  const ordered: VisualLine[] = [];

  for (const spanningLine of spanning) {
    const before = remaining.filter((line) => line.top < spanningLine.top);
    ordered.push(...sortLinesByColumn(before, boundaries), spanningLine);
    before.forEach((line) => remaining.splice(remaining.indexOf(line), 1));
  }
  ordered.push(...sortLinesByColumn(remaining, boundaries));

  return ordered.flatMap((line) => line.items);
}

function toVisualLine(items: RenderedTextItem[]) {
  return {
    items,
    left: Math.min(...items.map((item) => item.left)),
    top: Math.min(...items.map((item) => item.top)),
    right: Math.max(...items.map((item) => item.left + item.width)),
    height: Math.max(...items.map((item) => item.height)),
  };
}

function sortLinesByColumn<T extends { left: number; top: number }>(lines: T[], boundaries: number[]) {
  return [...lines].sort((a, b) => {
    const columnA = boundaries.filter((boundary) => a.left >= boundary).length;
    const columnB = boundaries.filter((boundary) => b.left >= boundary).length;
    return columnA - columnB || a.top - b.top || a.left - b.left;
  });
}

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

export function matchTextItemsToRects(
  items: RenderedTextItem[],
  rects: Array<{ x: number; y: number; width: number; height: number }>,
  pageWidth: number,
  pageHeight: number,
): RenderedTextItem[] {
  if (items.length === 0 || rects.length === 0) return [];

  const matched: RenderedTextItem[] = [];

  for (const item of items) {
    const itemLeft = item.left;
    const itemTop = item.top;
    const itemRight = item.left + item.width;
    const itemBottom = item.top + item.height;
    const itemArea = Math.max(1, item.width * item.height);

    const isSelected = rects.some((rect) => {
      const selectionLeft = rect.x * pageWidth;
      const selectionTop = rect.y * pageHeight;
      const selectionRight = (rect.x + rect.width) * pageWidth;
      const selectionBottom = (rect.y + rect.height) * pageHeight;
      const selectionArea = Math.max(1, (selectionRight - selectionLeft) * (selectionBottom - selectionTop));

      const overlapLeft = Math.max(itemLeft, selectionLeft);
      const overlapTop = Math.max(itemTop, selectionTop);
      const overlapRight = Math.min(itemRight, selectionRight);
      const overlapBottom = Math.min(itemBottom, selectionBottom);

      const overlapWidth = overlapRight - overlapLeft;
      const overlapHeight = overlapBottom - overlapTop;
      if (overlapWidth <= 0 || overlapHeight <= 0) {
        return false;
      }

      const overlapArea = overlapWidth * overlapHeight;
      const itemCoverage = overlapArea / itemArea;
      const selectionCoverage = overlapArea / selectionArea;

      // Use real geometric overlap instead of loose box-touch matching.
      // This avoids pulling in neighboring lines/paragraphs when their boxes
      // are close but the selected glyphs do not actually intersect.
      return itemCoverage >= 0.12 || selectionCoverage >= 0.32;
    });

    if (isSelected) {
      matched.push(item);
    }
  }

  return matched;
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

  const lines: GroupedLine[] = [];
  let currentLine: GroupedLine | null = null;

  for (const item of items) {
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
