import { FontCharset } from "@embedpdf/engines/pdfium";
import pdfiumWasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import fallbackFontUrl from "../../../../node_modules/@embedpdf/fonts-latin/fonts/NotoSans-Regular.ttf?url";

/** Same-origin PDFium runtime assets for restricted and offline deployments. */
export const pdfiumRuntimeWasmUrl = pdfiumWasmUrl;

/** Local fallback for the Latin and Vietnamese text used by technical drawings. */
export const pdfiumRuntimeFontFallback = {
  fonts: {
    [FontCharset.ANSI]: fallbackFontUrl,
    [FontCharset.DEFAULT]: fallbackFontUrl,
    [FontCharset.VIETNAMESE]: fallbackFontUrl,
    [FontCharset.GREEK]: fallbackFontUrl,
    [FontCharset.CYRILLIC]: fallbackFontUrl,
    [FontCharset.EASTERNEUROPEAN]: fallbackFontUrl,
  },
};
