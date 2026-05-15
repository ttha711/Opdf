export type DocumentTool =
  | "delete-pages"
  | "insert-pdf"
  | "crop-current"
  | "page-numbers"
  | "header"
  | "footer"
  | "bates"
  | "encrypt"
  | "decrypt"
  | "normalize"
  | "rotate-all-left"
  | "rotate-all-right";

export function parsePageList(input: string, totalPages: number): number[] {
  const pages = new Set<number>();
  for (const rawPart of input.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      for (let pageNumber = low; pageNumber <= high; pageNumber += 1) {
        if (pageNumber >= 1 && pageNumber <= totalPages) pages.add(pageNumber);
      }
      continue;
    }
    const pageNumber = Number(part);
    if (Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages) {
      pages.add(pageNumber);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

export function pickBrowserPdfBytes(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve(new Uint8Array(await file.arrayBuffer()));
    };
    input.click();
  });
}
