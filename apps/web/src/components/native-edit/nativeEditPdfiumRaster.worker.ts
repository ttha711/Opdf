import { init } from "@embedpdf/pdfium";
import pdfiumWasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";

type Request = { pdf: ArrayBuffer; pageIndex: number; maxWidth: number; maxHeight: number };
type Response =
  | { ok: true; width: number; height: number; rgba: ArrayBuffer }
  | { ok: false; error: string };

let modulePromise: Promise<any> | null = null;
async function pdfium() {
  if (!modulePromise) modulePromise = (async () => {
    const response = await fetch(pdfiumWasmUrl);
    if (!response.ok) throw new Error(`Unable to fetch PDFium WASM: ${response.status}`);
    const module = await init({ wasmBinary: await response.arrayBuffer() });
    module.PDFiumExt_Init();
    return module;
  })();
  return modulePromise;
}

async function render({ pdf, pageIndex, maxWidth, maxHeight }: Request): Promise<Response> {
  const module = await pdfium();
  const data = new Uint8Array(pdf);
  const filePtr = module.pdfium.wasmExports.malloc(data.byteLength);
  module.pdfium.HEAPU8.set(data, filePtr);
  let docPtr = 0, pagePtr = 0, bitmapPtr = 0;
  try {
    docPtr = module.FPDF_LoadMemDocument(filePtr, data.byteLength, "");
    if (!docPtr) throw new Error(`PDFium cannot open document: ${module.FPDF_GetLastError()}`);
    pagePtr = module.FPDF_LoadPage(docPtr, pageIndex);
    if (!pagePtr) throw new Error("PDFium cannot load page for raster fallback.");
    const sourceW = module.FPDF_GetPageWidthF(pagePtr);
    const sourceH = module.FPDF_GetPageHeightF(pagePtr);
    if (!(sourceW > 0 && sourceH > 0)) throw new Error("Invalid PDF page dimensions.");
    const scale = Math.min(
      Math.max(1, maxWidth) / sourceW,
      Math.max(1, maxHeight) / sourceH,
      Math.sqrt(650_000 / (sourceW * sourceH)),
    );
    const width = Math.max(1, Math.round(sourceW * scale));
    const height = Math.max(1, Math.round(sourceH * scale));
    bitmapPtr = module.FPDFBitmap_Create(width, height, 1);
    if (!bitmapPtr) throw new Error("PDFium cannot create raster bitmap.");
    module.FPDFBitmap_FillRect(bitmapPtr, 0, 0, width, height, 0xffffffff);
    module.FPDF_RenderPageBitmap(bitmapPtr, pagePtr, 0, 0, width, height, 0, 0);
    const buffer = module.FPDFBitmap_GetBuffer(bitmapPtr);
    const stride = module.FPDFBitmap_GetStride(bitmapPtr);
    if (!buffer || stride < width * 4) throw new Error("Invalid PDFium raster buffer.");
    const source = module.pdfium.HEAPU8;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      let from = buffer + y * stride;
      let to = y * width * 4;
      for (let x = 0; x < width; x++, from += 4, to += 4) {
        // PDFium's FPDFBitmap BGRA layout -> canvas RGBA.
        rgba[to] = source[from + 2];
        rgba[to + 1] = source[from + 1];
        rgba[to + 2] = source[from];
        rgba[to + 3] = source[from + 3];
      }
    }
    return { ok: true, width, height, rgba: rgba.buffer };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (bitmapPtr) module.FPDFBitmap_Destroy(bitmapPtr);
    if (pagePtr) module.FPDF_ClosePage(pagePtr);
    if (docPtr) module.FPDF_CloseDocument(docPtr);
    module.pdfium.wasmExports.free(filePtr);
  }
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const response = await render(event.data).catch((error): Response => ({
    ok: false, error: error instanceof Error ? error.message : String(error),
  }));
  if (response.ok) self.postMessage(response, { transfer: [response.rgba] });
  else self.postMessage(response);
};
