import type { PdfMatrix, PdfPoint, PdfQuad, PdfRect } from "@opdf/core";

type PdfiumModule = any;

export type ParsedContentObjectId = {
  pageIndex: number;
  rootObjectIndex: number;
  formChildIndices: number[];
};

export type ResolvedContentObject = ParsedContentObjectId & {
  objectPtr: number;
  parentFormPtr?: number;
  formAncestorPtrs: number[];
};

const IDENTITY: PdfMatrix = [1, 0, 0, 1, 0, 0];

function malloc(module: PdfiumModule, bytes: number) {
  return module.pdfium.wasmExports.malloc(bytes);
}

function free(module: PdfiumModule, ptr: number) {
  module.pdfium.wasmExports.free(ptr);
}

export function identityMatrix(): PdfMatrix {
  return IDENTITY.slice() as PdfMatrix;
}

export function multiplyMatrices(outer: PdfMatrix, inner: PdfMatrix): PdfMatrix {
  const [a1, b1, c1, d1, e1, f1] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function transformPoint(matrix: PdfMatrix, point: PdfPoint): PdfPoint {
  const [a, b, c, d, e, f] = matrix;
  return {
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f,
  };
}

export function transformQuad(matrix: PdfMatrix, quad: PdfQuad): PdfQuad {
  return quad.map((point) => transformPoint(matrix, point)) as PdfQuad;
}

export function quadBounds(quad: PdfQuad): PdfRect {
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const bottom = Math.min(...ys);
  const top = Math.max(...ys);
  return { x: left, y: bottom, width: right - left, height: top - bottom };
}

export function transformRect(matrix: PdfMatrix, rect: PdfRect): PdfRect {
  return quadBounds(transformQuad(matrix, [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ]));
}

export function readRotatedBounds(module: PdfiumModule, objectPtr: number): PdfQuad | undefined {
  if (typeof module.FPDFPageObj_GetRotatedBounds !== "function") return undefined;
  const ptr = malloc(module, 8 * 4);
  try {
    if (!module.FPDFPageObj_GetRotatedBounds(objectPtr, ptr)) return undefined;
    const base = ptr >>> 2;
    const heap = module.pdfium.HEAPF32;
    return [
      { x: heap[base], y: heap[base + 1] },
      { x: heap[base + 2], y: heap[base + 3] },
      { x: heap[base + 4], y: heap[base + 5] },
      { x: heap[base + 6], y: heap[base + 7] },
    ];
  } finally {
    free(module, ptr);
  }
}

export function parseContentObjectId(id: string): ParsedContentObjectId {
  const match = /^p(\d+)-o(\d+)((?:-f\d+)*)$/.exec(id);
  if (!match) throw new Error(`Unsupported content object id: ${id}`);
  const formChildIndices = match[3]
    ? match[3].split("-").filter(Boolean).map((part) => Number(part.slice(1)))
    : [];
  return {
    pageIndex: Number(match[1]),
    rootObjectIndex: Number(match[2]),
    formChildIndices,
  };
}

export function childContentObjectId(parentId: string, childIndex: number) {
  return `${parentId}-f${childIndex}`;
}

export function resolveContentObject(
  module: PdfiumModule,
  pagePtr: number,
  id: string,
): ResolvedContentObject {
  const parsed = parseContentObjectId(id);
  let objectPtr = module.FPDFPage_GetObject(pagePtr, parsed.rootObjectIndex);
  if (!objectPtr) throw new Error(`PDF content object no longer exists: ${id}`);
  let parentFormPtr: number | undefined;
  const formAncestorPtrs: number[] = [];

  for (const childIndex of parsed.formChildIndices) {
    if (
      typeof module.FPDFFormObj_GetObject !== "function" ||
      module.FPDFPageObj_GetType(objectPtr) !== 5
    ) {
      throw new Error(`PDFium cannot traverse nested Form XObject for ${id}.`);
    }
    parentFormPtr = objectPtr;
    formAncestorPtrs.push(parentFormPtr);
    objectPtr = module.FPDFFormObj_GetObject(parentFormPtr, childIndex);
    if (!objectPtr) throw new Error(`Nested PDF content object no longer exists: ${id}`);
  }

  return { ...parsed, objectPtr, parentFormPtr, formAncestorPtrs };
}

export function markFormAncestorsDirty(
  module: PdfiumModule,
  resolved: ResolvedContentObject,
) {
  if (!resolved.formAncestorPtrs.length) return;
  if (
    typeof module.FPDFPageObj_GetMatrix !== "function" ||
    typeof module.FPDFPageObj_SetMatrix !== "function"
  ) {
    throw new Error("PDFium cannot persist nested Form edits because matrix dirty-marking APIs are unavailable.");
  }

  const ptr = malloc(module, 6 * 4);
  try {
    for (let index = resolved.formAncestorPtrs.length - 1; index >= 0; index -= 1) {
      const formPtr = resolved.formAncestorPtrs[index];
      if (!module.FPDFPageObj_GetMatrix(formPtr, ptr)) {
        throw new Error("Unable to read Form XObject matrix while marking nested edit dirty.");
      }
      if (!module.FPDFPageObj_SetMatrix(formPtr, ptr)) {
        throw new Error("Unable to mark Form XObject dirty for nested edit persistence.");
      }
    }
  } finally {
    free(module, ptr);
  }
}

export function removeResolvedObject(
  module: PdfiumModule,
  pagePtr: number,
  resolved: ResolvedContentObject,
) {
  const removed = resolved.parentFormPtr
    ? typeof module.FPDFFormObj_RemoveObject === "function" &&
      module.FPDFFormObj_RemoveObject(resolved.parentFormPtr, resolved.objectPtr)
    : module.FPDFPage_RemoveObject(pagePtr, resolved.objectPtr);
  if (!removed) return false;
  module.FPDFPageObj_Destroy(resolved.objectPtr);
  return true;
}
