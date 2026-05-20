export async function loadPdfLib() {
  return import("pdf-lib");
}

export function parseColor(hex: string, pdfLib: any) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return pdfLib.rgb(0, 0, 0);
  const value = match[1];
  return pdfLib.rgb(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  );
}
