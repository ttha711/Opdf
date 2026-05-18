import type { SplitPart } from "./types";

function parsePagesInput(rawInput: string, totalPages: number): number[] {
  const pages = new Set<number>();
  const rawParts = rawInput.split(",");
  for (const raw of rawParts) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(trimmed);
    if (!match) continue;
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    for (let page = low; page <= high; page++) {
      if (page >= 1 && page <= totalPages) {
        pages.add(page);
      }
    }
  }
  return [...pages].sort((a, b) => a - b);
}

export function buildSplitParts(
  splitMode: "all" | "range" | "extract",
  splitRangeInput: string,
  splitExtractInput: string,
  totalPages: number,
  fileBase: string
): SplitPart[] {
  if (splitMode === "all") {
    const parts: SplitPart[] = [];
    for (let i = 1; i <= totalPages; i++) {
      parts.push({ name: `page-${i}-${fileBase}.pdf`, pages: [i] });
    }
    return parts;
  }

  if (splitMode === "range") {
    const parts: SplitPart[] = [];
    const rawParts = splitRangeInput.split(",");
    for (const raw of rawParts) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(trimmed);
      if (!match) continue;
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : start;
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      const pages = parsePagesInput(`${low}-${high}`, totalPages);
      if (pages.length > 0) {
        parts.push({ name: `pages-${low}-${high}-${fileBase}.pdf`, pages });
      }
    }
    return parts;
  }

  const pages = parsePagesInput(splitExtractInput, totalPages);
  if (pages.length === 0) return [];
  return [
    {
      name: `extracted-${pages.length}-pages-${fileBase}.pdf`,
      pages,
    },
  ];
}
