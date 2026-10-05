import { init } from "@embedpdf/pdfium";
import pdfiumWasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import type {
  PdfContentEditingEngine,
  PdfContentObject,
  PdfContentObjectKind,
  PdfContentPatch,
  PdfMatrix,
  PdfRect,
} from "@opdf/core";

type PdfiumModule = any;

let pdfiumPromise: Promise<PdfiumModule> | null = null;
const unicodeFontUrl = new URL("../../../../packages/core/src/assets/NotoSans-VietnameseMerged.ttf", import.meta.url).href;


async function getPdfium(): Promise<PdfiumModule> {
  if (!pdfiumPromise) {
    pdfiumPromise = (async () => {
      const response = await fetch(pdfiumWasmUrl);
      if (!response.ok) throw new Error(`Unable to load PDFium WASM: ${response.status}`);
      const module = await init({ wasmBinary: await response.arrayBuffer() });
      module.PDFiumExt_Init();
      return module;
    })();
  }
  return pdfiumPromise;
}

function malloc(module: PdfiumModule, bytes: number) {
  return module.pdfium.wasmExports.malloc(bytes);
}

function free(module: PdfiumModule, ptr: number) {
  module.pdfium.wasmExports.free(ptr);
}

function readFloatTuple(module: PdfiumModule, count: number, reader: (ptr: number) => boolean): number[] | null {
  const ptr = malloc(module, count * 4);
  try {
    if (!reader(ptr)) return null;
    const base = ptr >>> 2;
    return Array.from({ length: count }, (_, index) => module.pdfium.HEAPF32[base + index]);
  } finally {
    free(module, ptr);
  }
}

function readBounds(module: PdfiumModule, objectPtr: number): PdfRect | null {
  const ptr = malloc(module, 16);
  try {
    const left = ptr;
    const bottom = ptr + 4;
    const right = ptr + 8;
    const top = ptr + 12;
    if (!module.FPDFPageObj_GetBounds(objectPtr, left, bottom, right, top)) return null;
    const heap = module.pdfium.HEAPF32;
    const base = ptr >>> 2;
    const l = heap[base];
    const b = heap[base + 1];
    const r = heap[base + 2];
    const t = heap[base + 3];
    return { x: l, y: b, width: Math.max(0, r - l), height: Math.max(0, t - b) };
  } finally {
    free(module, ptr);
  }
}

function readMatrix(module: PdfiumModule, objectPtr: number): PdfMatrix {
  const values = readFloatTuple(module, 6, (ptr) => module.FPDFPageObj_GetMatrix(objectPtr, ptr));
  return (values ?? [1, 0, 0, 1, 0, 0]) as PdfMatrix;
}

function readUtf16ObjectText(module: PdfiumModule, objectPtr: number, textPagePtr: number): string {
  const bytes = module.FPDFTextObj_GetText(objectPtr, textPagePtr, 0, 0);
  if (!bytes) return "";
  const ptr = malloc(module, bytes);
  try {
    const written = module.FPDFTextObj_GetText(objectPtr, textPagePtr, ptr, bytes);
    return written ? module.pdfium.UTF16ToString(ptr) : "";
  } finally {
    free(module, ptr);
  }
}

function readUtf8(module: PdfiumModule, sizeReader: (ptr: number, size: number) => number): string | undefined {
  const bytes = sizeReader(0, 0);
  if (!bytes) return undefined;
  const ptr = malloc(module, bytes);
  try {
    return sizeReader(ptr, bytes) ? module.pdfium.UTF8ToString(ptr) : undefined;
  } finally {
    free(module, ptr);
  }
}

function readFontFamily(module: PdfiumModule, objectPtr: number): string | undefined {
  const fontPtr = module.FPDFTextObj_GetFont(objectPtr);
  if (!fontPtr) return undefined;
  return readUtf8(module, (ptr, size) => module.FPDFFont_GetFamilyName(fontPtr, ptr, size));
}

function readFontSize(module: PdfiumModule, objectPtr: number): number | undefined {
  const value = readFloatTuple(module, 1, (ptr) => module.FPDFTextObj_GetFontSize(objectPtr, ptr));
  return value?.[0];
}

function readFill(module: PdfiumModule, objectPtr: number): { fillColor?: string; opacity?: number } {
  const ptr = malloc(module, 16);
  try {
    if (!module.FPDFPageObj_GetFillColor(objectPtr, ptr, ptr + 4, ptr + 8, ptr + 12)) return {};
    const heap = module.pdfium.HEAPU32;
    const base = ptr >>> 2;
    const [r, g, b, a] = [heap[base], heap[base + 1], heap[base + 2], heap[base + 3]];
    const hex = [r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("");
    return { fillColor: `#${hex}`, opacity: Math.max(0, Math.min(255, a)) / 255 };
  } finally {
    free(module, ptr);
  }
}

function objectKind(type: number): PdfContentObjectKind | null {
  if (type === 1) return "text";
  if (type === 2) return "path";
  if (type === 3) return "image";
  return null;
}

async function loadUnicodeFont(module: PdfiumModule, docPtr: number): Promise<number> {
  const response = await fetch(unicodeFontUrl);
  if (!response.ok) throw new Error(`Unable to load OPDF Unicode font: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const ptr = malloc(module, bytes.byteLength);
  try {
    module.pdfium.HEAPU8.set(bytes, ptr);
    const fontPtr = module.FPDFText_LoadFont(docPtr, ptr, bytes.byteLength, 2, true);
    if (!fontPtr) throw new Error("PDFium could not embed the OPDF Unicode font.");
    return fontPtr;
  } finally {
    free(module, ptr);
  }
}

async function replaceTextObjectFontSize(
  module: PdfiumModule,
  docPtr: number,
  pagePtr: number,
  objectPtr: number,
  objectIndex: number,
  fontSize: number,
  fontFamily?: string,
): Promise<number> {
  const fontPtr = fontFamily === "__opdf_unicode__"
    ? await loadUnicodeFont(module, docPtr)
    : fontFamily
      ? module.FPDFText_LoadStandardFont(docPtr, fontFamily)
      : module.FPDFTextObj_GetFont(objectPtr);
  if (!fontPtr) throw new Error("Unable to load the requested PDF font.");
  const textPagePtr = module.FPDFText_LoadPage(pagePtr);
  if (!textPagePtr) throw new Error("Unable to read text before resizing.");
  let text = "";
  try {
    text = readUtf16ObjectText(module, objectPtr, textPagePtr);
  } finally {
    module.FPDFText_ClosePage(textPagePtr);
  }

  const matrix = readMatrix(module, objectPtr);
  const fill = readFill(module, objectPtr).fillColor ?? "#000000";
  const nextPtr = module.FPDFPageObj_CreateTextObj(docPtr, fontPtr, fontSize);
  if (!nextPtr) throw new Error("PDFium could not create the resized text object.");
  const textPtr = writeUtf16(module, text);
  const matrixPtr = writeMatrix(module, matrix);
  try {
    if (!module.FPDFText_SetText(nextPtr, textPtr)) throw new Error("PDFium could not copy resized text.");
    if (!module.FPDFPageObj_SetMatrix(nextPtr, matrixPtr)) throw new Error("PDFium could not preserve text transform.");
    const [r, g, b, a] = parseColor(fill);
    module.FPDFPageObj_SetFillColor(nextPtr, r, g, b, a);
    if (!module.FPDFPage_RemoveObject(pagePtr, objectPtr)) throw new Error("PDFium could not replace the old text object.");
    if (!module.FPDFPage_InsertObjectAtIndex(pagePtr, nextPtr, objectIndex)) {
      module.FPDFPage_InsertObject(pagePtr, nextPtr);
    }
    module.FPDFPageObj_Destroy(objectPtr);
    return nextPtr;
  } catch (error) {
    module.FPDFPageObj_Destroy(nextPtr);
    throw error;
  } finally {
    free(module, textPtr);
    free(module, matrixPtr);
  }
}

function writeUtf16(module: PdfiumModule, value: string): number {
  const ptr = malloc(module, (value.length + 1) * 2);
  const base = ptr >>> 1;
  for (let index = 0; index < value.length; index += 1) module.pdfium.HEAPU16[base + index] = value.charCodeAt(index);
  module.pdfium.HEAPU16[base + value.length] = 0;
  return ptr;
}

function writeMatrix(module: PdfiumModule, matrix: PdfMatrix): number {
  const ptr = malloc(module, 24);
  module.pdfium.HEAPF32.set(matrix, ptr >>> 2);
  return ptr;
}

async function replaceImageBitmap(
  module: PdfiumModule,
  pagePtr: number,
  objectPtr: number,
  bytes: Uint8Array,
  mimeType: "image/png" | "image/jpeg",
) {
  const bitmapSource = await createImageBitmap(new Blob([bytes as unknown as BlobPart], { type: mimeType }));
  try {
    const canvas = new OffscreenCanvas(bitmapSource.width, bitmapSource.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Unable to decode replacement image.");
    context.drawImage(bitmapSource, 0, 0);
    const rgba = context.getImageData(0, 0, bitmapSource.width, bitmapSource.height).data;
    const bitmapPtr = module.FPDFBitmap_CreateEx(bitmapSource.width, bitmapSource.height, 4, 0, bitmapSource.width * 4);
    if (!bitmapPtr) throw new Error("PDFium could not allocate a replacement image bitmap.");
    try {
      const bufferPtr = module.FPDFBitmap_GetBuffer(bitmapPtr);
      const stride = module.FPDFBitmap_GetStride(bitmapPtr);
      for (let y = 0; y < bitmapSource.height; y += 1) {
        for (let x = 0; x < bitmapSource.width; x += 1) {
          const source = (y * bitmapSource.width + x) * 4;
          const target = bufferPtr + y * stride + x * 4;
          module.pdfium.HEAPU8[target] = rgba[source + 2];
          module.pdfium.HEAPU8[target + 1] = rgba[source + 1];
          module.pdfium.HEAPU8[target + 2] = rgba[source];
          module.pdfium.HEAPU8[target + 3] = rgba[source + 3];
        }
      }
      const pagesPtr = malloc(module, 4);
      try {
        module.pdfium.HEAPU32[pagesPtr >>> 2] = pagePtr;
        if (!module.FPDFImageObj_SetBitmap(pagesPtr, 1, objectPtr, bitmapPtr)) {
          throw new Error("PDFium failed to replace the image object.");
        }
      } finally {
        free(module, pagesPtr);
      }
    } finally {
      module.FPDFBitmap_Destroy(bitmapPtr);
    }
  } finally {
    bitmapSource.close();
  }
}

function parseObjectId(id: string): { pageIndex: number; objectIndex: number } {
  const match = /^p(\d+)-o(\d+)$/.exec(id);
  if (!match) throw new Error(`Unsupported content object id: ${id}`);
  return { pageIndex: Number(match[1]), objectIndex: Number(match[2]) };
}

function parseColor(value: string): [number, number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) throw new Error(`Unsupported PDF content color: ${value}`);
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
    255,
  ];
}

async function withDocument<T>(pdf: Uint8Array, action: (module: PdfiumModule, docPtr: number) => Promise<T> | T): Promise<T> {
  const module = await getPdfium();
  const filePtr = malloc(module, pdf.byteLength);
  module.pdfium.HEAPU8.set(pdf, filePtr);
  const docPtr = module.FPDF_LoadMemDocument(filePtr, pdf.byteLength, "");
  if (!docPtr) {
    free(module, filePtr);
    throw new Error(`PDFium failed to open PDF (error ${module.FPDF_GetLastError()}).`);
  }
  try {
    return await action(module, docPtr);
  } finally {
    module.FPDF_CloseDocument(docPtr);
    free(module, filePtr);
  }
}

function saveDocument(module: PdfiumModule, docPtr: number): Uint8Array {
  const writer = module.PDFiumExt_OpenFileWriter();
  if (!writer) throw new Error("PDFium could not create an output writer.");
  try {
    if (!module.PDFiumExt_SaveAsCopy(docPtr, writer)) throw new Error("PDFium failed to serialize edited PDF.");
    const size = module.PDFiumExt_GetFileWriterSize(writer);
    if (!size) throw new Error("PDFium produced an empty edited PDF.");
    const ptr = malloc(module, size);
    try {
      const copied = module.PDFiumExt_GetFileWriterData(writer, ptr, size);
      if (!copied) throw new Error("PDFium failed to copy edited PDF bytes.");
      return new Uint8Array(module.pdfium.HEAPU8.slice(ptr, ptr + size));
    } finally {
      free(module, ptr);
    }
  } finally {
    module.PDFiumExt_CloseFileWriter(writer);
  }
}

export class PdfiumContentEditingEngine implements PdfContentEditingEngine {
  async inspectPage(pdf: Uint8Array, pageIndex: number): Promise<PdfContentObject[]> {
    return withDocument(pdf, async (module, docPtr) => {
      const pagePtr = module.FPDF_LoadPage(docPtr, pageIndex);
      if (!pagePtr) throw new Error(`Unable to load PDF page ${pageIndex + 1}.`);
      const textPagePtr = module.FPDFText_LoadPage(pagePtr);
      try {
        const objects: PdfContentObject[] = [];
        const pageWidth = module.FPDF_GetPageWidthF(pagePtr);
        const pageHeight = module.FPDF_GetPageHeightF(pagePtr);
        const count = module.FPDFPage_CountObjects(pagePtr);
        for (let objectIndex = 0; objectIndex < count; objectIndex += 1) {
          const objectPtr = module.FPDFPage_GetObject(pagePtr, objectIndex);
          const kind = objectKind(module.FPDFPageObj_GetType(objectPtr));
          const bounds = readBounds(module, objectPtr);
          if (!objectPtr || !kind || !bounds) continue;
          const object: PdfContentObject = {
            id: `p${pageIndex}-o${objectIndex}`,
            pageIndex,
            pageWidth,
            pageHeight,
            kind,
            bounds,
            matrix: readMatrix(module, objectPtr),
            ...readFill(module, objectPtr),
          };
          if (kind === "text" && textPagePtr) {
            object.text = readUtf16ObjectText(module, objectPtr, textPagePtr);
            object.fontFamily = readFontFamily(module, objectPtr);
            object.fontSize = readFontSize(module, objectPtr);
          }
          objects.push(object);
        }
        return objects;
      } finally {
        if (textPagePtr) module.FPDFText_ClosePage(textPagePtr);
        module.FPDF_ClosePage(pagePtr);
      }
    });
  }

  async applyPatches(pdf: Uint8Array, patches: PdfContentPatch[]): Promise<Uint8Array> {
    if (!patches.length) return pdf;
    return withDocument(pdf, async (module, docPtr) => {
      const grouped = new Map<number, PdfContentPatch[]>();
      for (const patch of patches) {
        const { pageIndex } = parseObjectId(patch.objectId);
        grouped.set(pageIndex, [...(grouped.get(pageIndex) ?? []), patch]);
      }

      for (const [pageIndex, pagePatches] of grouped) {
        const pagePtr = module.FPDF_LoadPage(docPtr, pageIndex);
        if (!pagePtr) throw new Error(`Unable to load PDF page ${pageIndex + 1} for editing.`);
        try {
          const handles = new Map<string, number>();
          for (const patch of pagePatches) {
            const { objectIndex } = parseObjectId(patch.objectId);
            const objectPtr = module.FPDFPage_GetObject(pagePtr, objectIndex);
            if (!objectPtr) throw new Error(`PDF content object no longer exists: ${patch.objectId}`);
            handles.set(patch.objectId, objectPtr);
          }

          for (const patch of pagePatches) {
            const objectPtr = handles.get(patch.objectId)!;
            if (patch.type === "replace-text") {
              const textPtr = writeUtf16(module, patch.text);
              try {
                if (!module.FPDFText_SetText(objectPtr, textPtr)) throw new Error(`Unable to edit text object ${patch.objectId}.`);
              } finally {
                free(module, textPtr);
              }
            } else if (patch.type === "transform") {
              const matrixPtr = writeMatrix(module, patch.matrix);
              try {
                if (!module.FPDFPageObj_SetMatrix(objectPtr, matrixPtr)) throw new Error(`Unable to transform ${patch.objectId}.`);
              } finally {
                free(module, matrixPtr);
              }
            } else if (patch.type === "relative-transform") {
              const [a, b, c, d, e, f] = patch.matrix;
              module.FPDFPageObj_Transform(objectPtr, a, b, c, d, e, f);
            } else if (patch.type === "delete") {
              if (!module.FPDFPage_RemoveObject(pagePtr, objectPtr)) throw new Error(`Unable to delete ${patch.objectId}.`);
            } else if (patch.type === "style-text") {
              let styledObjectPtr = objectPtr;
              if (patch.fontSize !== undefined || patch.fontFamily) {
                const { objectIndex } = parseObjectId(patch.objectId);
                const currentSize = readFontSize(module, objectPtr) ?? 12;
                styledObjectPtr = await replaceTextObjectFontSize(
                  module,
                  docPtr,
                  pagePtr,
                  objectPtr,
                  objectIndex,
                  patch.fontSize ?? currentSize,
                  patch.fontFamily,
                );
                handles.set(patch.objectId, styledObjectPtr);
              }
              if (patch.fillColor) {
                const [r, g, b, a] = parseColor(patch.fillColor);
                if (!module.FPDFPageObj_SetFillColor(styledObjectPtr, r, g, b, a)) throw new Error(`Unable to change text color for ${patch.objectId}.`);
              }
            } else if (patch.type === "replace-image") {
              if (module.FPDFPageObj_GetType(objectPtr) !== 3) throw new Error(`${patch.objectId} is not an image object.`);
              await replaceImageBitmap(module, pagePtr, objectPtr, patch.bytes, patch.mimeType);
            } else if (patch.type === "style-object") {
              if (patch.fillColor) {
                const [r, g, b, a] = parseColor(patch.fillColor);
                if (!module.FPDFPageObj_SetFillColor(objectPtr, r, g, b, a)) throw new Error(`Unable to set fill color for ${patch.objectId}.`);
              }
              if (patch.strokeColor) {
                const [r, g, b, a] = parseColor(patch.strokeColor);
                if (!module.FPDFPageObj_SetStrokeColor(objectPtr, r, g, b, a)) throw new Error(`Unable to set stroke color for ${patch.objectId}.`);
              }
              if (patch.strokeWidth !== undefined && !module.FPDFPageObj_SetStrokeWidth(objectPtr, patch.strokeWidth)) {
                throw new Error(`Unable to set stroke width for ${patch.objectId}.`);
              }
            } else {
              throw new Error(`Content patch ${patch.type} is not implemented by the PDFium engine yet.`);
            }
          }

          if (!module.FPDFPage_GenerateContent(pagePtr)) throw new Error(`PDFium failed to regenerate page ${pageIndex + 1}.`);
        } finally {
          module.FPDF_ClosePage(pagePtr);
        }
      }

      return saveDocument(module, docPtr);
    });
  }
}

export const pdfiumContentEditingEngine = new PdfiumContentEditingEngine();
