// A subset font may not contain glyphs which were never drawn with it.
// PDFium can accept FPDFText_SetText while silently omitting those glyphs.
export function needsSubsetFontFallback(
  baseFontName: string | undefined,
  previousText: string,
  nextText: string,
): boolean {
  if (!baseFontName || !/^[A-Z]{6}\+/.test(baseFontName) || previousText === nextText) return false;
  const existing = new Set(Array.from(previousText.normalize("NFC")));
  return Array.from(nextText.normalize("NFC")).some((character) =>
    !/\s/u.test(character) && !existing.has(character),
  );
}
