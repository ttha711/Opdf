import { init } from "@embedpdf/pdfium";
import pdfiumWasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import type {
  PdfContentEditingEngine,
  PdfContentObject,
  PdfContentObjectKind,
  PdfContentPatch,
  PdfMatrix,
  PdfPathCommand,
  PdfRect,
} from "@opdf/core";
import {
  childContentObjectId,
  identityMatrix,
  multiplyMatrices,
  parseContentObjectId,
  readRotatedBounds,
  removeResolvedObject,
  resolveContentObject,
  transformQuad,
  transformRect,
} from "./pdfiumObjectTree";

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
  if (type === 4) return "shading";
  if (type === 5) return "form";
  return null;
}

const TEXT_RENDER_MODE_NAMES = [
  "fill",
  "stroke",
  "fill-stroke",
  "invisible",
  "fill-clip",
  "stroke-clip",
  "fill-stroke-clip",
  "clip",
] as const;

const LINE_CAP_NAMES = ["butt", "round", "square"] as const;
const LINE_JOIN_NAMES = ["miter", "round", "bevel"] as const;

function readTextRenderMode(module: PdfiumModule, objectPtr: number) {
  if (typeof module.FPDFTextObj_GetTextRenderMode !== "function") return undefined;
  const mode = module.FPDFTextObj_GetTextRenderMode(objectPtr);
  return TEXT_RENDER_MODE_NAMES[mode] ?? undefined;
}

function readLineCap(module: PdfiumModule, objectPtr: number) {
  if (typeof module.FPDFPageObj_GetLineCap !== "function") return undefined;
  return LINE_CAP_NAMES[module.FPDFPageObj_GetLineCap(objectPtr)] ?? undefined;
}

function readLineJoin(module: PdfiumModule, objectPtr: number) {
  if (typeof module.FPDFPageObj_GetLineJoin !== "function") return undefined;
  return LINE_JOIN_NAMES[module.FPDFPageObj_GetLineJoin(objectPtr)] ?? undefined;
}

function readDash(module: PdfiumModule, objectPtr: number): { dashArray?: number[]; dashPhase?: number } {
  if (
    typeof module.FPDFPageObj_GetDashCount !== "function" ||
    typeof module.FPDFPageObj_GetDashArray !== "function" ||
    typeof module.FPDFPageObj_GetDashPhase !== "function"
  ) return {};
  const count = module.FPDFPageObj_GetDashCount(objectPtr);
  if (!Number.isFinite(count) || count <= 0) return {};
  const dashPtr = malloc(module, count * 4);
  const phasePtr = malloc(module, 4);
  try {
    if (!module.FPDFPageObj_GetDashArray(objectPtr, dashPtr, count)) return {};
    const base = dashPtr >>> 2;
    const dashArray = Array.from({ length: count }, (_, index) => module.pdfium.HEAPF32[base + index]);
    const dashPhase = module.FPDFPageObj_GetDashPhase(objectPtr, phasePtr)
      ? module.pdfium.HEAPF32[phasePtr >>> 2]
      : undefined;
    return { dashArray, dashPhase };
  } finally {
    free(module, phasePtr);
    free(module, dashPtr);
  }
}

function readPathDrawMode(module: PdfiumModule, objectPtr: number) {
  if (typeof module.FPDFPath_GetDrawMode !== "function") return {};
  const ptr = malloc(module, 8);
  try {
    if (!module.FPDFPath_GetDrawMode(objectPtr, ptr, ptr + 4)) return {};
    const fillMode = module.pdfium.HEAP32[ptr >>> 2];
    const stroke = Boolean(module.pdfium.HEAP32[(ptr >>> 2) + 1]);
    return {
      pathFillMode: fillMode === 1 ? "alternate" as const : fillMode === 2 ? "winding" as const : "none" as const,
      pathStroke: stroke,
    };
  } finally {
    free(module, ptr);
  }
}

function readImageInfo(module: PdfiumModule, objectPtr: number) {
  const filters: string[] = [];
  if (
    typeof module.FPDFImageObj_GetImageFilterCount === "function" &&
    typeof module.FPDFImageObj_GetImageFilter === "function"
  ) {
    const count = module.FPDFImageObj_GetImageFilterCount(objectPtr);
    for (let index = 0; index < count; index += 1) {
      const name = readUtf8(module, (ptr, size) => module.FPDFImageObj_GetImageFilter(objectPtr, index, ptr, size));
      if (name) filters.push(name);
    }
  }
  if (typeof module.FPDFImageObj_GetImagePixelSize !== "function") {
    return filters.length ? { width: 0, height: 0, horizontalDpi: 0, verticalDpi: 0, bitsPerPixel: 0, colorSpace: 0, colorSpaceName: "unknown", filters } : undefined;
  }
  const ptr = malloc(module, 8);
  try {
    if (!module.FPDFImageObj_GetImagePixelSize(objectPtr, ptr, ptr + 4)) return undefined;
    const width = module.pdfium.HEAPU32[ptr >>> 2];
    const height = module.pdfium.HEAPU32[(ptr >>> 2) + 1];
    return {
      width,
      height,
      horizontalDpi: 0,
      verticalDpi: 0,
      bitsPerPixel: 0,
      colorSpace: 0,
      colorSpaceName: "unknown",
      filters,
    };
  } finally {
    free(module, ptr);
  }
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
    copyCommonStyle(module, objectPtr, nextPtr);
    const renderMode = readTextRenderMode(module, objectPtr);
    if (renderMode && typeof module.FPDFTextObj_SetTextRenderMode === "function") {
      module.FPDFTextObj_SetTextRenderMode(nextPtr, TEXT_RENDER_MODE_NAMES.indexOf(renderMode));
    }
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


function readStroke(module: PdfiumModule, objectPtr: number): string | undefined {
  const ptr = malloc(module, 16);
  try {
    if (!module.FPDFPageObj_GetStrokeColor(objectPtr, ptr, ptr + 4, ptr + 8, ptr + 12)) return undefined;
    const heap = module.pdfium.HEAPU32;
    const base = ptr >>> 2;
    return "#" + [heap[base], heap[base + 1], heap[base + 2]]
      .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0"))
      .join("");
  } finally {
    free(module, ptr);
  }
}

function readStrokeWidth(module: PdfiumModule, objectPtr: number): number | undefined {
  const value = readFloatTuple(module, 1, (ptr) => module.FPDFPageObj_GetStrokeWidth(objectPtr, ptr));
  return value?.[0];
}

function copyPageObjectColor(
  module: PdfiumModule,
  sourcePtr: number,
  targetPtr: number,
  getter: (objectPtr: number, r: number, g: number, b: number, a: number) => boolean,
  setter: (objectPtr: number, r: number, g: number, b: number, a: number) => boolean,
) {
  const ptr = malloc(module, 16);
  try {
    if (!getter(sourcePtr, ptr, ptr + 4, ptr + 8, ptr + 12)) return;
    const heap = module.pdfium.HEAPU32;
    const base = ptr >>> 2;
    setter(targetPtr, heap[base], heap[base + 1], heap[base + 2], heap[base + 3]);
  } finally {
    free(module, ptr);
  }
}

function copyCommonStyle(module: PdfiumModule, sourcePtr: number, targetPtr: number) {
  copyPageObjectColor(
    module,
    sourcePtr,
    targetPtr,
    module.FPDFPageObj_GetFillColor.bind(module),
    module.FPDFPageObj_SetFillColor.bind(module),
  );
  copyPageObjectColor(
    module,
    sourcePtr,
    targetPtr,
    module.FPDFPageObj_GetStrokeColor.bind(module),
    module.FPDFPageObj_SetStrokeColor.bind(module),
  );

  const width = readStrokeWidth(module, sourcePtr);
  if (width !== undefined) module.FPDFPageObj_SetStrokeWidth(targetPtr, width);

  const lineCap = typeof module.FPDFPageObj_GetLineCap === "function" ? module.FPDFPageObj_GetLineCap(sourcePtr) : -1;
  if (lineCap >= 0 && typeof module.FPDFPageObj_SetLineCap === "function") module.FPDFPageObj_SetLineCap(targetPtr, lineCap);
  const lineJoin = typeof module.FPDFPageObj_GetLineJoin === "function" ? module.FPDFPageObj_GetLineJoin(sourcePtr) : -1;
  if (lineJoin >= 0 && typeof module.FPDFPageObj_SetLineJoin === "function") module.FPDFPageObj_SetLineJoin(targetPtr, lineJoin);

  const dashCount = typeof module.FPDFPageObj_GetDashCount === "function" ? module.FPDFPageObj_GetDashCount(sourcePtr) : 0;
  if (
    dashCount > 0 &&
    typeof module.FPDFPageObj_GetDashArray === "function" &&
    typeof module.FPDFPageObj_GetDashPhase === "function" &&
    typeof module.FPDFPageObj_SetDashArray === "function"
  ) {
    const dashPtr = malloc(module, dashCount * 4);
    const phasePtr = malloc(module, 4);
    try {
      if (
        module.FPDFPageObj_GetDashArray(sourcePtr, dashPtr, dashCount) &&
        module.FPDFPageObj_GetDashPhase(sourcePtr, phasePtr)
      ) {
        const phase = module.pdfium.HEAPF32[phasePtr >>> 2];
        module.FPDFPageObj_SetDashArray(targetPtr, dashPtr, dashCount, phase);
      }
    } finally {
      free(module, phasePtr);
      free(module, dashPtr);
    }
  }

  const matrixPtr = writeMatrix(module, readMatrix(module, sourcePtr));
  try {
    module.FPDFPageObj_SetMatrix(targetPtr, matrixPtr);
  } finally {
    free(module, matrixPtr);
  }
}

function offsetObject(module: PdfiumModule, objectPtr: number, dx: number, dy: number) {
  module.FPDFPageObj_Transform(objectPtr, 1, 0, 0, 1, dx, dy);
}

function duplicateTextObject(
  module: PdfiumModule,
  docPtr: number,
  pagePtr: number,
  sourcePtr: number,
  objectIndex: number,
  dx: number,
  dy: number,
) {
  const fontPtr = module.FPDFTextObj_GetFont(sourcePtr);
  const fontSize = readFontSize(module, sourcePtr) ?? 12;
  if (!fontPtr) throw new Error("Unable to duplicate text without a font.");
  const textPagePtr = module.FPDFText_LoadPage(pagePtr);
  if (!textPagePtr) throw new Error("Unable to read text for duplication.");
  let text = "";
  try {
    text = readUtf16ObjectText(module, sourcePtr, textPagePtr);
  } finally {
    module.FPDFText_ClosePage(textPagePtr);
  }
  const targetPtr = module.FPDFPageObj_CreateTextObj(docPtr, fontPtr, fontSize);
  if (!targetPtr) throw new Error("PDFium could not create duplicated text.");
  const textPtr = writeUtf16(module, text);
  try {
    if (!module.FPDFText_SetText(targetPtr, textPtr)) throw new Error("PDFium could not copy duplicated text.");
    copyCommonStyle(module, sourcePtr, targetPtr);
    offsetObject(module, targetPtr, dx, dy);
    if (!module.FPDFPage_InsertObjectAtIndex(pagePtr, targetPtr, objectIndex + 1)) module.FPDFPage_InsertObject(pagePtr, targetPtr);
  } catch (error) {
    module.FPDFPageObj_Destroy(targetPtr);
    throw error;
  } finally {
    free(module, textPtr);
  }
  return targetPtr;
}

function bitmapBytesPerPixel(format: number) {
  if (format === 1) return 1;
  if (format === 2) return 3;
  if (format === 3 || format === 4) return 4;
  throw new Error("Unsupported PDFium bitmap format.");
}

function duplicateImageObject(
  module: PdfiumModule,
  docPtr: number,
  pagePtr: number,
  sourcePtr: number,
  objectIndex: number,
  dx: number,
  dy: number,
) {
  const sourceBitmap = module.FPDFImageObj_GetBitmap(sourcePtr);
  if (!sourceBitmap) throw new Error("Unable to read image bitmap for duplication.");
  const targetPtr = module.FPDFPageObj_NewImageObj(docPtr);
  if (!targetPtr) {
    module.FPDFBitmap_Destroy(sourceBitmap);
    throw new Error("PDFium could not create duplicated image.");
  }
  const pagesPtr = malloc(module, 4);
  try {
    module.pdfium.HEAPU32[pagesPtr >>> 2] = pagePtr;
    if (!module.FPDFImageObj_SetBitmap(pagesPtr, 1, targetPtr, sourceBitmap)) throw new Error("PDFium could not copy image bitmap.");
    copyCommonStyle(module, sourcePtr, targetPtr);
    offsetObject(module, targetPtr, dx, dy);
    if (!module.FPDFPage_InsertObjectAtIndex(pagePtr, targetPtr, objectIndex + 1)) module.FPDFPage_InsertObject(pagePtr, targetPtr);
  } catch (error) {
    module.FPDFPageObj_Destroy(targetPtr);
    throw error;
  } finally {
    free(module, pagesPtr);
    module.FPDFBitmap_Destroy(sourceBitmap);
  }
  return targetPtr;
}


function readPathCommands(module: PdfiumModule, objectPtr: number): PdfPathCommand[] {
  const count = module.FPDFPath_CountSegments(objectPtr);
  if (!Number.isFinite(count) || count <= 0) return [];
  const commands: PdfPathCommand[] = [];
  const pointPtr = malloc(module, 24);
  try {
    const heap = module.pdfium.HEAPF32;
    for (let index = 0; index < count; index += 1) {
      const segment = module.FPDFPath_GetPathSegment(objectPtr, index);
      if (!segment) continue;
      const type = module.FPDFPathSegment_GetType(segment);
      if (type === 2 || type === 0) {
        if (!module.FPDFPathSegment_GetPoint(segment, pointPtr, pointPtr + 4)) continue;
        const base = pointPtr >>> 2;
        if (type === 2) commands.push({ type: "move", x: heap[base], y: heap[base + 1] });
        else commands.push({
          type: "line",
          x: heap[base],
          y: heap[base + 1],
          close: Boolean(module.FPDFPathSegment_GetClose(segment)),
        });
        continue;
      }
      if (type !== 1 || index + 2 >= count) continue;
      const control2 = module.FPDFPath_GetPathSegment(objectPtr, index + 1);
      const end = module.FPDFPath_GetPathSegment(objectPtr, index + 2);
      if (
        !control2 ||
        !end ||
        module.FPDFPathSegment_GetType(control2) !== 1 ||
        module.FPDFPathSegment_GetType(end) !== 1
      ) continue;
      if (
        module.FPDFPathSegment_GetPoint(segment, pointPtr, pointPtr + 4) &&
        module.FPDFPathSegment_GetPoint(control2, pointPtr + 8, pointPtr + 12) &&
        module.FPDFPathSegment_GetPoint(end, pointPtr + 16, pointPtr + 20)
      ) {
        const base = pointPtr >>> 2;
        commands.push({
          type: "bezier",
          x1: heap[base],
          y1: heap[base + 1],
          x2: heap[base + 2],
          y2: heap[base + 3],
          x: heap[base + 4],
          y: heap[base + 5],
          close: Boolean(module.FPDFPathSegment_GetClose(end)),
        });
      }
      index += 2;
    }
  } finally {
    free(module, pointPtr);
  }
  return commands;
}

function createPathFromCommands(module: PdfiumModule, commands: PdfPathCommand[]): number {
  const first = commands[0];
  if (!first || first.type !== "move") throw new Error("A PDF path must start with a move command.");
  const pathPtr = module.FPDFPageObj_CreateNewPath(first.x, first.y);
  if (!pathPtr) throw new Error("PDFium could not create a replacement path.");
  try {
    for (const command of commands.slice(1)) {
      if (command.type === "move") {
        if (!module.FPDFPath_MoveTo(pathPtr, command.x, command.y)) throw new Error("Unable to add path move command.");
      } else if (command.type === "line") {
        if (!module.FPDFPath_LineTo(pathPtr, command.x, command.y)) throw new Error("Unable to add path line command.");
        if (command.close) module.FPDFPath_Close(pathPtr);
      } else {
        if (!module.FPDFPath_BezierTo(pathPtr, command.x1, command.y1, command.x2, command.y2, command.x, command.y)) {
          throw new Error("Unable to add path bezier command.");
        }
        if (command.close) module.FPDFPath_Close(pathPtr);
      }
    }
    return pathPtr;
  } catch (error) {
    module.FPDFPageObj_Destroy(pathPtr);
    throw error;
  }
}

function copyPathDrawMode(module: PdfiumModule, sourcePtr: number, targetPtr: number) {
  const ptr = malloc(module, 8);
  try {
    if (!module.FPDFPath_GetDrawMode(sourcePtr, ptr, ptr + 4)) return;
    const base = ptr >>> 2;
    module.FPDFPath_SetDrawMode(targetPtr, module.pdfium.HEAP32[base], Boolean(module.pdfium.HEAP32[base + 1]));
  } finally {
    free(module, ptr);
  }
}

function duplicatePathObject(
  module: PdfiumModule,
  pagePtr: number,
  sourcePtr: number,
  objectIndex: number,
  dx: number,
  dy: number,
) {
  const commands = readPathCommands(module, sourcePtr);
  if (!commands.length) throw new Error("Unable to duplicate an empty path.");
  const targetPtr = createPathFromCommands(module, commands);
  try {
    copyPathDrawMode(module, sourcePtr, targetPtr);
    copyCommonStyle(module, sourcePtr, targetPtr);
    offsetObject(module, targetPtr, dx, dy);
    if (!module.FPDFPage_InsertObjectAtIndex(pagePtr, targetPtr, objectIndex + 1)) {
      module.FPDFPage_InsertObject(pagePtr, targetPtr);
    }
  } catch (error) {
    module.FPDFPageObj_Destroy(targetPtr);
    throw error;
  }
  return targetPtr;
}

function parentMatrixForResolved(module: PdfiumModule, resolved: ReturnType<typeof resolveContentObject>): PdfMatrix {
  let matrix = identityMatrix();
  for (const formPtr of resolved.formAncestorPtrs) {
    matrix = multiplyMatrices(matrix, readMatrix(module, formPtr));
  }
  return matrix;
}

function promoteNestedObjectToPage(
  module: PdfiumModule,
  docPtr: number,
  pagePtr: number,
  resolved: ReturnType<typeof resolveContentObject>,
) {
  if (resolved.formChildIndices.length !== 1 || !resolved.parentFormPtr) {
    throw new Error("Editing Form XObjects nested more than one level is read-only because PDFium cannot persist those child streams safely.");
  }

  const sourcePtr = resolved.objectPtr;
  const objectType = module.FPDFPageObj_GetType(sourcePtr);
  const pageCount = module.FPDFPage_CountObjects(pagePtr);
  const insertAfter = Math.max(0, pageCount - 1);
  let targetPtr = 0;

  if (objectType === 1) {
    targetPtr = duplicateTextObject(module, docPtr, pagePtr, sourcePtr, insertAfter, 0, 0);
    const renderMode = readTextRenderMode(module, sourcePtr);
    if (renderMode && typeof module.FPDFTextObj_SetTextRenderMode === "function") {
      module.FPDFTextObj_SetTextRenderMode(targetPtr, TEXT_RENDER_MODE_NAMES.indexOf(renderMode));
    }
  } else if (objectType === 2) {
    targetPtr = duplicatePathObject(module, pagePtr, sourcePtr, insertAfter, 0, 0);
  } else if (objectType === 3) {
    targetPtr = duplicateImageObject(module, docPtr, pagePtr, sourcePtr, insertAfter, 0, 0);
  } else {
    throw new Error("Only text, path, and image children can be promoted out of a Form XObject for editing.");
  }

  const worldMatrix = multiplyMatrices(parentMatrixForResolved(module, resolved), readMatrix(module, sourcePtr));
  const matrixPtr = writeMatrix(module, worldMatrix);
  try {
    if (!module.FPDFPageObj_SetMatrix(targetPtr, matrixPtr)) {
      throw new Error("Unable to preserve nested Form object transform while promoting it for editing.");
    }
  } catch (error) {
    if (module.FPDFPage_RemoveObject(pagePtr, targetPtr)) module.FPDFPageObj_Destroy(targetPtr);
    throw error;
  } finally {
    free(module, matrixPtr);
  }

  if (!removeResolvedObject(module, pagePtr, resolved)) {
    if (module.FPDFPage_RemoveObject(pagePtr, targetPtr)) module.FPDFPageObj_Destroy(targetPtr);
    throw new Error("Unable to remove the original object from its Form XObject after promotion.");
  }

  const rootObjectIndex = Math.max(0, module.FPDFPage_CountObjects(pagePtr) - 1);
  return {
    ...resolved,
    objectPtr: targetPtr,
    parentFormPtr: undefined,
    formAncestorPtrs: [],
    formChildIndices: [],
    rootObjectIndex,
  };
}

function cropImageObject(
  module: PdfiumModule,
  pagePtr: number,
  objectPtr: number,
  crop: { left: number; top: number; right: number; bottom: number },
) {
  const bitmapPtr = module.FPDFImageObj_GetBitmap(objectPtr);
  if (!bitmapPtr) throw new Error("Unable to read image bitmap for crop.");
  try {
    const width = module.FPDFBitmap_GetWidth(bitmapPtr);
    const height = module.FPDFBitmap_GetHeight(bitmapPtr);
    const format = module.FPDFBitmap_GetFormat(bitmapPtr);
    const stride = module.FPDFBitmap_GetStride(bitmapPtr);
    const sourcePtr = module.FPDFBitmap_GetBuffer(bitmapPtr);
    const bpp = bitmapBytesPerPixel(format);
    const left = Math.max(0, Math.min(width - 1, Math.floor(width * crop.left)));
    const top = Math.max(0, Math.min(height - 1, Math.floor(height * crop.top)));
    const right = Math.max(left + 1, Math.min(width, Math.ceil(width * (1 - crop.right))));
    const bottom = Math.max(top + 1, Math.min(height, Math.ceil(height * (1 - crop.bottom))));
    const outWidth = right - left;
    const outHeight = bottom - top;
    const outStride = outWidth * bpp;
    const outBitmap = module.FPDFBitmap_CreateEx(outWidth, outHeight, format, 0, outStride);
    if (!outBitmap) throw new Error("PDFium could not allocate cropped bitmap.");
    try {
      const outPtr = module.FPDFBitmap_GetBuffer(outBitmap);
      for (let y = 0; y < outHeight; y += 1) {
        const sourceRow = sourcePtr + (top + y) * stride + left * bpp;
        const targetRow = outPtr + y * outStride;
        module.pdfium.HEAPU8.copyWithin(targetRow, sourceRow, sourceRow + outStride);
      }
      const pagesPtr = malloc(module, 4);
      try {
        module.pdfium.HEAPU32[pagesPtr >>> 2] = pagePtr;
        if (!module.FPDFImageObj_SetBitmap(pagesPtr, 1, objectPtr, outBitmap)) throw new Error("PDFium failed to apply image crop.");
      } finally {
        free(module, pagesPtr);
      }
    } finally {
      module.FPDFBitmap_Destroy(outBitmap);
    }
  } finally {
    module.FPDFBitmap_Destroy(bitmapPtr);
  }
}

function patchPageIndex(patch: PdfContentPatch): number {
  return patch.type === "add-text" || patch.type === "add-rect" || patch.type === "add-image"
    ? patch.pageIndex
    : parseContentObjectId(patch.objectId).pageIndex;
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

function inspectObject(
  module: PdfiumModule,
  textPagePtr: number,
  pageWidth: number,
  pageHeight: number,
  objectPtr: number,
  id: string,
  parentMatrix: PdfMatrix,
  parentId: string | undefined,
  depth: number,
): PdfContentObject | null {
  if (!objectPtr) return null;
  const kind = objectKind(module.FPDFPageObj_GetType(objectPtr));
  const localBounds = readBounds(module, objectPtr);
  if (!kind || !localBounds) return null;
  const matrix = readMatrix(module, objectPtr);
  const localQuad = readRotatedBounds(module, objectPtr);
  const object: PdfContentObject = {
    id,
    pageIndex: parseContentObjectId(id).pageIndex,
    pageWidth,
    pageHeight,
    kind,
    bounds: depth ? transformRect(parentMatrix, localBounds) : localBounds,
    localBounds,
    rotatedBounds: localQuad
      ? (depth ? transformQuad(parentMatrix, localQuad) : localQuad)
      : undefined,
    matrix,
    parentMatrix: depth ? parentMatrix : undefined,
    parentId,
    depth,
    ...readFill(module, objectPtr),
  };
  object.hasTransparency = typeof module.FPDFPageObj_HasTransparency === "function"
    ? Boolean(module.FPDFPageObj_HasTransparency(objectPtr))
    : undefined;
  object.markedContentId = typeof module.FPDFPageObj_GetMarkedContentID === "function"
    ? module.FPDFPageObj_GetMarkedContentID(objectPtr)
    : undefined;

  if (kind === "text" && textPagePtr) {
    object.text = readUtf16ObjectText(module, objectPtr, textPagePtr);
    object.fontFamily = readFontFamily(module, objectPtr);
    object.fontSize = readFontSize(module, objectPtr);
    object.textRenderMode = readTextRenderMode(module, objectPtr);
    object.strokeColor = readStroke(module, objectPtr);
    object.strokeWidth = readStrokeWidth(module, objectPtr);
  } else if (kind === "path") {
    object.pathCommands = readPathCommands(module, objectPtr);
    object.strokeColor = readStroke(module, objectPtr);
    object.strokeWidth = readStrokeWidth(module, objectPtr);
    object.lineCap = readLineCap(module, objectPtr);
    object.lineJoin = readLineJoin(module, objectPtr);
    Object.assign(object, readDash(module, objectPtr), readPathDrawMode(module, objectPtr));
  } else if (kind === "image") {
    object.imageInfo = readImageInfo(module, objectPtr);
  } else if (kind === "form") {
    object.formChildCount = typeof module.FPDFFormObj_CountObjects === "function"
      ? module.FPDFFormObj_CountObjects(objectPtr)
      : undefined;
  }
  return object;
}

function appendObjectTree(
  module: PdfiumModule,
  textPagePtr: number,
  pageWidth: number,
  pageHeight: number,
  objectPtr: number,
  id: string,
  parentMatrix: PdfMatrix,
  parentId: string | undefined,
  depth: number,
  objects: PdfContentObject[],
) {
  const object = inspectObject(
    module,
    textPagePtr,
    pageWidth,
    pageHeight,
    objectPtr,
    id,
    parentMatrix,
    parentId,
    depth,
  );
  if (!object) return;
  objects.push(object);

  if (
    object.kind !== "form" ||
    depth >= 8 ||
    typeof module.FPDFFormObj_CountObjects !== "function" ||
    typeof module.FPDFFormObj_GetObject !== "function"
  ) return;

  const count = module.FPDFFormObj_CountObjects(objectPtr);
  if (!Number.isFinite(count) || count <= 0) return;
  const childParentMatrix = multiplyMatrices(parentMatrix, object.matrix);
  for (let childIndex = 0; childIndex < count; childIndex += 1) {
    const childPtr = module.FPDFFormObj_GetObject(objectPtr, childIndex);
    if (!childPtr) continue;
    appendObjectTree(
      module,
      textPagePtr,
      pageWidth,
      pageHeight,
      childPtr,
      childContentObjectId(id, childIndex),
      childParentMatrix,
      id,
      depth + 1,
      objects,
    );
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
        const rootMatrix = identityMatrix();
        for (let objectIndex = 0; objectIndex < count; objectIndex += 1) {
          const objectPtr = module.FPDFPage_GetObject(pagePtr, objectIndex);
          appendObjectTree(
            module,
            textPagePtr,
            pageWidth,
            pageHeight,
            objectPtr,
            `p${pageIndex}-o${objectIndex}`,
            rootMatrix,
            undefined,
            0,
            objects,
          );
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
        const pageIndex = patchPageIndex(patch);
        grouped.set(pageIndex, [...(grouped.get(pageIndex) ?? []), patch]);
      }

      for (const [pageIndex, pagePatches] of grouped) {
        const pagePtr = module.FPDF_LoadPage(docPtr, pageIndex);
        if (!pagePtr) throw new Error(`Unable to load PDF page ${pageIndex + 1} for editing.`);
        try {
          const handles = new Map<string, ReturnType<typeof resolveContentObject>>();
          for (const patch of pagePatches) {
            if (patch.type === "add-text" || patch.type === "add-rect" || patch.type === "add-image") continue;
            handles.set(patch.objectId, resolveContentObject(module, pagePtr, patch.objectId));
          }

          for (const patch of pagePatches) {
            if (patch.type === "add-text") {
              const fontPtr = patch.fontFamily === "__opdf_unicode__"
                ? await loadUnicodeFont(module, docPtr)
                : module.FPDFText_LoadStandardFont(docPtr, patch.fontFamily || "Helvetica");
              if (!fontPtr) throw new Error("Unable to load font for new text.");
              const textPtr = module.FPDFPageObj_CreateTextObj(docPtr, fontPtr, patch.fontSize);
              if (!textPtr) throw new Error("PDFium could not create a new text object.");
              const valuePtr = writeUtf16(module, patch.text);
              try {
                if (!module.FPDFText_SetText(textPtr, valuePtr)) throw new Error("PDFium could not set new text.");
                const [r, g, b, a] = parseColor(patch.fillColor ?? "#000000");
                module.FPDFPageObj_SetFillColor(textPtr, r, g, b, a);
                if (patch.renderMode && typeof module.FPDFTextObj_SetTextRenderMode === "function") {
                  module.FPDFTextObj_SetTextRenderMode(textPtr, TEXT_RENDER_MODE_NAMES.indexOf(patch.renderMode));
                }
                module.FPDFPageObj_Transform(textPtr, 1, 0, 0, 1, patch.x, patch.y);
                module.FPDFPage_InsertObject(pagePtr, textPtr);
              } catch (error) {
                module.FPDFPageObj_Destroy(textPtr);
                throw error;
              } finally {
                free(module, valuePtr);
              }
              continue;
            }
            if (patch.type === "add-rect") {
              const pathPtr = module.FPDFPageObj_CreateNewRect(patch.x, patch.y, patch.width, patch.height);
              if (!pathPtr) throw new Error("PDFium could not create a rectangle object.");
              try {
                if (patch.fillColor) {
                  const [r, g, b, a] = parseColor(patch.fillColor);
                  module.FPDFPageObj_SetFillColor(pathPtr, r, g, b, a);
                }
                if (patch.strokeColor) {
                  const [r, g, b, a] = parseColor(patch.strokeColor);
                  module.FPDFPageObj_SetStrokeColor(pathPtr, r, g, b, a);
                }
                if (patch.strokeWidth !== undefined) module.FPDFPageObj_SetStrokeWidth(pathPtr, patch.strokeWidth);
                const fillMode = patch.fillMode === "alternate" ? 1 : patch.fillMode === "winding" ? 2 : 0;
                module.FPDFPath_SetDrawMode(pathPtr, fillMode, Boolean(patch.stroke));
                module.FPDFPage_InsertObject(pagePtr, pathPtr);
              } catch (error) {
                module.FPDFPageObj_Destroy(pathPtr);
                throw error;
              }
              continue;
            }
            if (patch.type === "add-image") {
              const imagePtr = module.FPDFPageObj_NewImageObj(docPtr);
              if (!imagePtr) throw new Error("PDFium could not create an image object.");
              try {
                await replaceImageBitmap(module, pagePtr, imagePtr, patch.bytes, patch.mimeType);
                if (typeof module.FPDFImageObj_SetMatrix === "function") {
                  module.FPDFImageObj_SetMatrix(imagePtr, patch.width, 0, 0, patch.height, patch.x, patch.y);
                } else {
                  const matrixPtr = writeMatrix(module, [patch.width, 0, 0, patch.height, patch.x, patch.y]);
                  try {
                    module.FPDFPageObj_SetMatrix(imagePtr, matrixPtr);
                  } finally {
                    free(module, matrixPtr);
                  }
                }
                module.FPDFPage_InsertObject(pagePtr, imagePtr);
              } catch (error) {
                module.FPDFPageObj_Destroy(imagePtr);
                throw error;
              }
              continue;
            }

            let resolved = handles.get(patch.objectId)!;
            if (resolved.formChildIndices.length > 1) {
              throw new Error("Form XObjects nested more than one level are inspect-only; PDFium cannot persist safe deep mutations at that depth.");
            }
            if (resolved.formChildIndices.length === 1 && patch.type !== "delete") {
              resolved = promoteNestedObjectToPage(module, docPtr, pagePtr, resolved);
              handles.set(patch.objectId, resolved);
            }
            const objectPtr = resolved.objectPtr;
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
              if (!removeResolvedObject(module, pagePtr, resolved)) throw new Error(`Unable to delete ${patch.objectId}.`);
            } else if (patch.type === "duplicate") {
              const objectIndex = resolved.rootObjectIndex;
              const dx = patch.offsetX ?? 12;
              const dy = patch.offsetY ?? -12;
              const objectType = module.FPDFPageObj_GetType(objectPtr);
              if (objectType === 1) duplicateTextObject(module, docPtr, pagePtr, objectPtr, objectIndex, dx, dy);
              else if (objectType === 2) duplicatePathObject(module, pagePtr, objectPtr, objectIndex, dx, dy);
              else if (objectType === 3) duplicateImageObject(module, docPtr, pagePtr, objectPtr, objectIndex, dx, dy);
              else throw new Error(`Duplicate is not supported for ${patch.objectId}.`);
            } else if (patch.type === "style-text") {
              let styledObjectPtr = objectPtr;
              if (patch.fontSize !== undefined || patch.fontFamily) {
                const objectIndex = resolved.rootObjectIndex;
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
                handles.set(patch.objectId, { ...resolved, objectPtr: styledObjectPtr });
              }
              if (patch.fillColor || patch.fillOpacity !== undefined) {
                const [r, g, b] = parseColor(patch.fillColor ?? readFill(module, styledObjectPtr).fillColor ?? "#000000");
                const alpha = Math.round(255 * Math.max(0, Math.min(1, patch.fillOpacity ?? readFill(module, styledObjectPtr).opacity ?? 1)));
                if (!module.FPDFPageObj_SetFillColor(styledObjectPtr, r, g, b, alpha)) throw new Error(`Unable to change text fill for ${patch.objectId}.`);
              }
              if (patch.strokeColor || patch.strokeOpacity !== undefined) {
                const [r, g, b] = parseColor(patch.strokeColor ?? readStroke(module, styledObjectPtr) ?? "#000000");
                const alpha = Math.round(255 * Math.max(0, Math.min(1, patch.strokeOpacity ?? 1)));
                if (!module.FPDFPageObj_SetStrokeColor(styledObjectPtr, r, g, b, alpha)) throw new Error(`Unable to change text stroke for ${patch.objectId}.`);
              }
              if (patch.strokeWidth !== undefined) module.FPDFPageObj_SetStrokeWidth(styledObjectPtr, patch.strokeWidth);
              if (patch.renderMode && typeof module.FPDFTextObj_SetTextRenderMode === "function") {
                const mode = TEXT_RENDER_MODE_NAMES.indexOf(patch.renderMode);
                if (mode >= 0 && !module.FPDFTextObj_SetTextRenderMode(styledObjectPtr, mode)) {
                  throw new Error(`Unable to change text render mode for ${patch.objectId}.`);
                }
              }
            } else if (patch.type === "replace-image") {
              if (module.FPDFPageObj_GetType(objectPtr) !== 3) throw new Error(`${patch.objectId} is not an image object.`);
              await replaceImageBitmap(module, pagePtr, objectPtr, patch.bytes, patch.mimeType);
            } else if (patch.type === "crop-image") {
              if (module.FPDFPageObj_GetType(objectPtr) !== 3) throw new Error(`${patch.objectId} is not an image object.`);
              cropImageObject(module, pagePtr, objectPtr, patch);
            } else if (patch.type === "replace-path") {
              if (module.FPDFPageObj_GetType(objectPtr) !== 2) throw new Error(`${patch.objectId} is not a path object.`);
              const objectIndex = resolved.rootObjectIndex;
              const nextPtr = createPathFromCommands(module, patch.commands);
              try {
                copyPathDrawMode(module, objectPtr, nextPtr);
                copyCommonStyle(module, objectPtr, nextPtr);
                if (!module.FPDFPage_RemoveObject(pagePtr, objectPtr)) throw new Error(`Unable to replace path ${patch.objectId}.`);
                if (!module.FPDFPage_InsertObjectAtIndex(pagePtr, nextPtr, objectIndex)) module.FPDFPage_InsertObject(pagePtr, nextPtr);
                module.FPDFPageObj_Destroy(objectPtr);
                handles.set(patch.objectId, { ...resolved, objectPtr: nextPtr });
              } catch (error) {
                module.FPDFPageObj_Destroy(nextPtr);
                throw error;
              }
            } else if (patch.type === "style-object") {
              if (patch.fillColor || patch.fillOpacity !== undefined) {
                const [r, g, b] = parseColor(patch.fillColor ?? readFill(module, objectPtr).fillColor ?? "#000000");
                const alpha = Math.round(255 * Math.max(0, Math.min(1, patch.fillOpacity ?? readFill(module, objectPtr).opacity ?? 1)));
                if (!module.FPDFPageObj_SetFillColor(objectPtr, r, g, b, alpha)) throw new Error(`Unable to set fill color for ${patch.objectId}.`);
              }
              if (patch.strokeColor || patch.strokeOpacity !== undefined) {
                const [r, g, b] = parseColor(patch.strokeColor ?? readStroke(module, objectPtr) ?? "#000000");
                const alpha = Math.round(255 * Math.max(0, Math.min(1, patch.strokeOpacity ?? 1)));
                if (!module.FPDFPageObj_SetStrokeColor(objectPtr, r, g, b, alpha)) throw new Error(`Unable to set stroke color for ${patch.objectId}.`);
              }
              if (patch.strokeWidth !== undefined && !module.FPDFPageObj_SetStrokeWidth(objectPtr, patch.strokeWidth)) {
                throw new Error(`Unable to set stroke width for ${patch.objectId}.`);
              }
              if (patch.lineCap && typeof module.FPDFPageObj_SetLineCap === "function") {
                module.FPDFPageObj_SetLineCap(objectPtr, LINE_CAP_NAMES.indexOf(patch.lineCap));
              }
              if (patch.lineJoin && typeof module.FPDFPageObj_SetLineJoin === "function") {
                module.FPDFPageObj_SetLineJoin(objectPtr, LINE_JOIN_NAMES.indexOf(patch.lineJoin));
              }
              if (patch.dashArray && typeof module.FPDFPageObj_SetDashArray === "function") {
                const ptr = malloc(module, patch.dashArray.length * 4);
                try {
                  module.pdfium.HEAPF32.set(patch.dashArray, ptr >>> 2);
                  module.FPDFPageObj_SetDashArray(objectPtr, ptr, patch.dashArray.length, patch.dashPhase ?? 0);
                } finally {
                  free(module, ptr);
                }
              }
              if (
                module.FPDFPageObj_GetType(objectPtr) === 2 &&
                (patch.pathFillMode || patch.pathStroke !== undefined) &&
                typeof module.FPDFPath_SetDrawMode === "function"
              ) {
                const current = readPathDrawMode(module, objectPtr);
                const fillMode = (patch.pathFillMode ?? current.pathFillMode) === "alternate"
                  ? 1
                  : (patch.pathFillMode ?? current.pathFillMode) === "winding"
                    ? 2
                    : 0;
                module.FPDFPath_SetDrawMode(objectPtr, fillMode, patch.pathStroke ?? current.pathStroke ?? true);
              }
              if (patch.blendMode && typeof module.FPDFPageObj_SetBlendMode === "function") {
                module.FPDFPageObj_SetBlendMode(objectPtr, patch.blendMode);
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
