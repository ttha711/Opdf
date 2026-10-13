import { FontCharset } from "@embedpdf/engines/pdfium";
import pdfiumWasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import fallbackFontUrl from "../../../../node_modules/@embedpdf/fonts-latin/fonts/NotoSans-Regular.ttf?url";

/** Blob workers cannot resolve path-relative WASM/font URLs against blob: bases. */
function absoluteWorkerAssetUrl(url: string) {
  return typeof window === "undefined" ? url : new URL(url, window.location.href).href;
}

/** Same-origin PDFium runtime assets for restricted and offline deployments. */
export const pdfiumRuntimeWasmUrl = absoluteWorkerAssetUrl(pdfiumWasmUrl);
const absoluteFallbackFontUrl = absoluteWorkerAssetUrl(fallbackFontUrl);

/** Local fallback for the Latin and Vietnamese text used by technical drawings. */
export const pdfiumRuntimeFontFallback = {
  fonts: {
    [FontCharset.ANSI]: absoluteFallbackFontUrl,
    [FontCharset.DEFAULT]: absoluteFallbackFontUrl,
    [FontCharset.VIETNAMESE]: absoluteFallbackFontUrl,
    [FontCharset.GREEK]: absoluteFallbackFontUrl,
    [FontCharset.CYRILLIC]: absoluteFallbackFontUrl,
    [FontCharset.EASTERNEUROPEAN]: absoluteFallbackFontUrl,
  },
};
