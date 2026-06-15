import { useEffect, useMemo, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import { parsePageList } from "../lib/document-tools";
import { canvasToBlob } from "./PdfViewer.utils";

GlobalWorkerOptions.workerSrc = workerSrc;

type PrintScope = "all" | "current" | "selected" | "range";
type PageSubset = "all" | "odd" | "even";
type PageSizing = "actual-size" | "fit-page" | "zoom";
type PrintSheet = {
  pageNumber: number;
  width: number;
  height: number;
  url: string;
};

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  totalPages: number;
  currentPage: number;
  selectedPages: number[];
  docBytes: Uint8Array | null;
  annotations: any[];
  bridge: any;
  setViewerError: (msg: string | null) => void;
}

const LETTER_PORTRAIT = [612, 792] as const;
const LETTER_LANDSCAPE = [792, 612] as const;
const PAGE_PADDING = 36;
const CM_TO_PT = 72 / 2.54;

const PAPER_SIZE_DIMS: Record<string, [number, number]> = {
  // ISO A series
  a0:        [2384, 3370], a1:        [1684, 2384], a2:      [1191, 1684],
  a3:        [842,  1191], a4:        [595,  842],  a5:      [420,  595],
  a6:        [298,  420],  a7:        [210,  298],  a8:      [147,  210],
  // ISO B series
  b3iso:     [1001, 1417], b4iso:     [709,  1001], b5iso:   [499,  709],
  b6iso:     [354,  499],
  // JIS B series
  b4jis:     [729,  1032], b5jis:     [516,  729],  b6jis:   [363,  516],
  // North American
  letter:    [612,  792],  legal:     [612,  1008], tabloid: [792,  1224],
  statement: [396,  612],  executive: [522,  756],
  letterx:   [684,  864],  legalx:    [684,  1080],
  // Architectural ANSI
  archa:     [648,  864],  archb:     [864,  1296], archc:   [1296, 1728],
  archd:     [1728, 2592], arche:     [2592, 3456],
  // Engineering ANSI
  csize:     [1224, 1584], dsize:     [1584, 2448], esize:   [2448, 3168],
  // Photo
  photo4x6:  [288,  432],  photo5x7:  [360,  504],  photo8x10:[576, 720],
  // Envelopes
  env9:      [279,  638],  env10:     [297,  684],  envmonarch:[279, 540],
  envdl:     [312,  624],  envc6:     [323,  459],
  envc5:     [459,  649],  envc4:     [649,  918],
};

function getSheetDims(paperSize: string, orientation: string): [number, number] {
  const [pw, ph] = PAPER_SIZE_DIMS[paperSize] ?? [595, 842];
  const [pw2, ph2] = pw < ph ? [pw, ph] : [ph, pw]; // ensure portrait order
  return orientation === "landscape" ? [ph2, pw2] : [pw2, ph2];
}

function getNupGrid(n: number): [number, number] {
  const map: Record<number, [number, number]> = {
    1: [1,1], 2: [2,1], 4: [2,2], 6: [3,2], 9: [3,3], 16: [4,4],
  };
  return map[n] ?? [1, 1];
}

function getNupCells(cols: number, rows: number, layout: string): [number, number][] {
  const out: [number, number][] = [];
  if (layout === "hr") {
    for (let r = 0; r < rows; r++) for (let c = cols - 1; c >= 0; c--) out.push([r, c]);
  } else if (layout === "v") {
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) out.push([r, c]);
  } else if (layout === "vr") {
    for (let c = cols - 1; c >= 0; c--) for (let r = 0; r < rows; r++) out.push([r, c]);
  } else {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([r, c]);
  }
  return out;
}

function buildBookletOrder(pages: number[], subset: string): [number, number][] {
  const padded = [...pages];
  while (padded.length % 4 !== 0) padded.push(0);
  const n = padded.length;
  const out: [number, number][] = [];
  for (let i = 0; i < n / 4; i++) {
    const fl = padded[n - 1 - i * 2];
    const fr = padded[i * 2];
    const bl = padded[i * 2 + 1];
    const br = padded[n - 2 - i * 2];
    if (subset !== "back-only")  out.push([fl, fr]);
    if (subset !== "front-only") out.push([bl, br]);
  }
  return out;
}

const PAPER_SIZE_GROUPS: { group: string; sizes: { value: string; label: string }[] }[] = [
  {
    group: "ISO A",
    sizes: [
      { value: "a0",  label: "A0 (841×1189mm)" },
      { value: "a1",  label: "A1 (594×841mm)" },
      { value: "a2",  label: "A2 (420×594mm)" },
      { value: "a3",  label: "A3 (297×420mm)" },
      { value: "a4",  label: "A4 (210×297mm)" },
      { value: "a5",  label: "A5 (148×210mm)" },
      { value: "a6",  label: "A6 (105×148mm)" },
      { value: "a7",  label: "A7 (74×105mm)" },
      { value: "a8",  label: "A8 (52×74mm)" },
    ],
  },
  {
    group: "ISO B",
    sizes: [
      { value: "b3iso", label: "B3 (353×500mm)" },
      { value: "b4iso", label: "B4 (250×353mm)" },
      { value: "b5iso", label: "B5 (176×250mm)" },
      { value: "b6iso", label: "B6 (125×176mm)" },
    ],
  },
  {
    group: "JIS B",
    sizes: [
      { value: "b4jis", label: "B4 JIS (257×364mm)" },
      { value: "b5jis", label: "B5 JIS (182×257mm)" },
      { value: "b6jis", label: "B6 JIS (128×182mm)" },
    ],
  },
  {
    group: "North American",
    sizes: [
      { value: "letter",    label: "Letter (8.5×11in)" },
      { value: "legal",     label: "Legal (8.5×14in)" },
      { value: "tabloid",   label: "Tabloid / Ledger (11×17in)" },
      { value: "statement", label: "Statement (5.5×8.5in)" },
      { value: "executive", label: "Executive (7.25×10.5in)" },
      { value: "letterx",   label: "Letter Extra (9.5×12in)" },
      { value: "legalx",    label: "Legal Extra (9.5×15in)" },
    ],
  },
  {
    group: "Architectural",
    sizes: [
      { value: "archa", label: "Arch A (9×12in)" },
      { value: "archb", label: "Arch B (12×18in)" },
      { value: "archc", label: "Arch C (18×24in)" },
      { value: "archd", label: "Arch D (24×36in)" },
      { value: "arche", label: "Arch E (36×48in)" },
      { value: "csize", label: "ANSI C (17×22in)" },
      { value: "dsize", label: "ANSI D (22×34in)" },
      { value: "esize", label: "ANSI E (34×44in)" },
    ],
  },
  {
    group: "Photo",
    sizes: [
      { value: "photo4x6",  label: "4×6 in (102×152mm)" },
      { value: "photo5x7",  label: "5×7 in (127×178mm)" },
      { value: "photo8x10", label: "8×10 in (203×254mm)" },
    ],
  },
  {
    group: "Envelopes",
    sizes: [
      { value: "env9",      label: "Envelope #9 (98×225mm)" },
      { value: "env10",     label: "Envelope #10 (105×241mm)" },
      { value: "envmonarch",label: "Monarch (98×191mm)" },
      { value: "envdl",     label: "DL (110×220mm)" },
      { value: "envc6",     label: "C6 (114×162mm)" },
      { value: "envc5",     label: "C5 (162×229mm)" },
      { value: "envc4",     label: "C4 (229×324mm)" },
    ],
  },
];

type PrintMode = "multiple" | "poster" | "booklet";
type PageOrderLayout = "h" | "hr" | "v" | "vr";

function PageOrderIcon({ type }: { type: PageOrderLayout }) {
  const s = 26;
  const c = 4;
  const g = 2;
  const cellW = (s - g) / 2;
  const positions = [
    [g / 2, g / 2], [cellW + g * 1.5, g / 2],
    [g / 2, cellW + g * 1.5], [cellW + g * 1.5, cellW + g * 1.5],
  ];
  const orders: Record<PageOrderLayout, number[]> = {
    h:  [0, 1, 2, 3],
    hr: [1, 0, 3, 2],
    v:  [0, 2, 1, 3],
    vr: [2, 0, 3, 1],
  };
  const seq = orders[type];
  const arrows: [number, number, number, number][] = [
    [seq[0], seq[1]], [seq[1], seq[2]], [seq[2], seq[3]],
  ].map(([a, b]) => {
    const [ax, ay] = positions[a];
    const [bx, by] = positions[b];
    return [ax + c / 2, ay + c / 2, bx + c / 2, by + c / 2] as [number, number, number, number];
  });
  return (
    <svg viewBox={`0 0 ${s} ${s}`} width={s} height={s} fill="none">
      {positions.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={cellW} height={cellW} rx="1" stroke="currentColor" strokeWidth="1.2" />
      ))}
      {arrows.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1" markerEnd="url(#arr)" opacity="0.6" />
      ))}
      <defs>
        <marker id="arr" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
          <path d="M0 0 L4 2 L0 4 z" fill="currentColor" />
        </marker>
      </defs>
    </svg>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function uniqueSortedPages(pages: number[]) {
  return [...new Set(pages)].filter((page) => Number.isInteger(page) && page > 0).sort((a, b) => a - b);
}

function getBasePages(scope: PrintScope, currentPage: number, selectedPages: number[], customRange: string, totalPages: number) {
  if (scope === "all") {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (scope === "current") {
    return [currentPage];
  }
  if (scope === "selected") {
    return uniqueSortedPages(selectedPages);
  }
  return parsePageList(customRange, totalPages);
}

function applySubset(pages: number[], subset: PageSubset) {
  if (subset === "odd") return pages.filter((page) => page % 2 === 1);
  if (subset === "even") return pages.filter((page) => page % 2 === 0);
  return pages;
}

function expandCopies(pages: number[], copies: number) {
  const out: number[] = [];
  for (let i = 0; i < copies; i += 1) {
    out.push(...pages);
  }
  return out;
}

function chooseSheetSize(width: number, height: number) {
  return width >= height ? LETTER_LANDSCAPE : LETTER_PORTRAIT;
}

function computeDrawBox(srcWidth: number, srcHeight: number, sheetWidth: number, sheetHeight: number, sizing: PageSizing, zoomPercent: number) {
  if (sizing === "actual-size") {
    return {
      x: 0,
      y: 0,
      width: srcWidth,
      height: srcHeight,
    };
  }

  const fitScale = Math.min(
    (sheetWidth - PAGE_PADDING * 2) / Math.max(1, srcWidth),
    (sheetHeight - PAGE_PADDING * 2) / Math.max(1, srcHeight)
  );
  const scale = sizing === "fit-page" ? fitScale : fitScale * (zoomPercent / 100);
  const width = srcWidth * scale;
  const height = srcHeight * scale;

  return {
    x: (sheetWidth - width) / 2,
    y: (sheetHeight - height) / 2,
    width,
    height,
  };
}

async function renderPdfPageToCanvas(pdf: PDFDocumentProxy, pageNumber: number, scale: number, grayscale: boolean) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    page.cleanup();
    return null;
  }

  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));

  await page.render({ canvasContext: ctx, viewport }).promise;

  if (grayscale) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  page.cleanup();

  const blob = await canvasToBlob(canvas, "image/png", 1);
  if (!blob) return null;

  return {
    blob,
    width: viewport.width,
    height: viewport.height,
  };
}

async function buildPrintPreviewUrl(bytes: Uint8Array, pageNumber: number, grayscale: boolean) {
  const pdf = await getDocument({ data: bytes.slice() }).promise;
  try {
    const rendered = await renderPdfPageToCanvas(pdf, pageNumber, 0.6, grayscale);
    if (!rendered) return null;
    return URL.createObjectURL(rendered.blob);
  } finally {
    pdf.destroy();
  }
}

async function buildLivePreview(
  bytes: Uint8Array,
  sheetPages: number[],
  opts: {
    grayscale: boolean;
    paperSize: string;
    orientation: string;
    printMode: PrintMode;
    pagesPerSheet: number;
    pageOrderLayout: string;
    multiMarginCm: number;
    printPageBorder: boolean;
    tileScale: number;
    tileOverlapCm: number;
    bookletMarginCm: number;
    sizing: PageSizing;
    zoomPercent: number;
  }
): Promise<string | null> {
  const PREVIEW_W = 600;
  let [paperW, paperH] = getSheetDims(opts.paperSize, opts.orientation);
  if (opts.printMode === "multiple" && opts.pagesPerSheet === 2) {
    [paperW, paperH] = [Math.max(paperW, paperH), Math.min(paperW, paperH)];
  }
  if (opts.printMode === "booklet") {
    paperW = Math.max(paperW, paperH) * 2;
    paperH = Math.min(paperW / 2, paperH);
  }
  const canvasW = PREVIEW_W;
  const canvasH = Math.round(PREVIEW_W * paperH / paperW);
  const ptScale = PREVIEW_W / paperW;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctxNullable = canvas.getContext("2d");
  if (!ctxNullable) return null;
  const ctx = ctxNullable;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);

  const pdfJs = await getDocument({ data: bytes.slice() }).promise;

  async function drawInRegion(pageNum: number, rx: number, ry: number, rw: number, rh: number) {
    if (pageNum <= 0) return;
    const page = await pdfJs.getPage(pageNum);
    const vp0 = page.getViewport({ scale: 1 });
    const fitScale = Math.min(rw / vp0.width, rh / vp0.height);
    const vp = page.getViewport({ scale: fitScale });
    const tmp = document.createElement("canvas");
    tmp.width = Math.max(1, Math.round(vp.width));
    tmp.height = Math.max(1, Math.round(vp.height));
    const tmpCtx = tmp.getContext("2d")!;
    await page.render({ canvasContext: tmpCtx, viewport: vp }).promise;
    if (opts.grayscale) {
      const id = tmpCtx.getImageData(0, 0, tmp.width, tmp.height);
      for (let i = 0; i < id.data.length; i += 4) {
        const g = Math.round(id.data[i] * 0.299 + id.data[i + 1] * 0.587 + id.data[i + 2] * 0.114);
        id.data[i] = id.data[i + 1] = id.data[i + 2] = g;
      }
      tmpCtx.putImageData(id, 0, 0);
    }
    page.cleanup();
    ctx.drawImage(tmp, rx + (rw - tmp.width) / 2, ry + (rh - tmp.height) / 2);
  }

  if (opts.pagesPerSheet <= 1) {
    // Draw margin indicator (matches PAGE_PADDING used in actual PDF output)
    const marginPx = PAGE_PADDING * ptScale;
    ctx.strokeStyle = "rgba(180,180,210,0.35)";
    ctx.setLineDash([3, 2]);
    ctx.lineWidth = 0.8;
    ctx.strokeRect(marginPx, marginPx, canvasW - 2 * marginPx, canvasH - 2 * marginPx);
    ctx.setLineDash([]);

    const pageNum = sheetPages[0] ?? 0;
    if (pageNum > 0) {
      const page = await pdfJs.getPage(pageNum);
      const vp0 = page.getViewport({ scale: 1 });
      // Use same fitting logic as computeDrawBox (with PAGE_PADDING margins)
      const fitScale = Math.min(
        (paperW - PAGE_PADDING * 2) / Math.max(1, vp0.width),
        (paperH - PAGE_PADDING * 2) / Math.max(1, vp0.height)
      );
      const contentW = vp0.width * fitScale * ptScale;
      const contentH = vp0.height * fitScale * ptScale;
      const contentX = (canvasW - contentW) / 2;
      const contentY = (canvasH - contentH) / 2;
      const renderScale = fitScale * ptScale;
      const vp = page.getViewport({ scale: Math.max(0.1, renderScale) });
      const tmp = document.createElement("canvas");
      tmp.width = Math.max(1, Math.round(vp.width));
      tmp.height = Math.max(1, Math.round(vp.height));
      const tmpCtx = tmp.getContext("2d")!;
      await page.render({ canvasContext: tmpCtx, viewport: vp }).promise;
      if (opts.grayscale) {
        const id = tmpCtx.getImageData(0, 0, tmp.width, tmp.height);
        for (let i = 0; i < id.data.length; i += 4) {
          const g = Math.round(id.data[i] * 0.299 + id.data[i + 1] * 0.587 + id.data[i + 2] * 0.114);
          id.data[i] = id.data[i + 1] = id.data[i + 2] = g;
        }
        tmpCtx.putImageData(id, 0, 0);
      }
      page.cleanup();
      ctx.drawImage(tmp, contentX, contentY, contentW, contentH);
    }
  } else if (opts.printMode === "multiple") {
    const [cols, rows] = getNupGrid(opts.pagesPerSheet);
    const cells = getNupCells(cols, rows, opts.pageOrderLayout);
    const m = opts.multiMarginCm * CM_TO_PT * ptScale;
    const cellW = (canvasW - m * (cols + 1)) / cols;
    const cellH = (canvasH - m * (rows + 1)) / rows;
    for (let j = 0; j < opts.pagesPerSheet; j++) {
      const [row, col] = cells[j] ?? [0, 0];
      const cx = m + col * (cellW + m);
      const cy = m + row * (cellH + m);
      await drawInRegion(sheetPages[j] ?? 0, cx, cy, cellW, cellH);
      if (opts.printPageBorder) {
        ctx.strokeStyle = "rgba(80,80,80,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, cellW, cellH);
      }
    }
  } else if (opts.printMode === "poster") {
    const pageNum = sheetPages[0] ?? 0;
    if (pageNum > 0) {
      const page = await pdfJs.getPage(pageNum);
      const vp0 = page.getViewport({ scale: 1 });
      page.cleanup();
      const fitScale = Math.min(canvasW / vp0.width, canvasH / vp0.height) * 0.88;
      const rendW = vp0.width * fitScale;
      const rendH = vp0.height * fitScale;
      const ox = (canvasW - rendW) / 2;
      const oy = (canvasH - rendH) / 2;
      await drawInRegion(pageNum, ox, oy, rendW, rendH);
      // Tile grid overlay
      const enlargedW = vp0.width * (opts.tileScale / 100);
      const enlargedH = vp0.height * (opts.tileScale / 100);
      const [pw, ph] = getSheetDims(opts.paperSize, opts.orientation);
      const tileWpt = Math.max(1, pw - opts.tileOverlapCm * CM_TO_PT);
      const tileHpt = Math.max(1, ph - opts.tileOverlapCm * CM_TO_PT);
      const tilesX = Math.max(1, Math.ceil(enlargedW / tileWpt));
      const tilesY = Math.max(1, Math.ceil(enlargedH / tileHpt));
      ctx.strokeStyle = "rgba(37,99,235,0.55)";
      ctx.setLineDash([5, 3]);
      ctx.lineWidth = 1.5;
      for (let tx = 1; tx < tilesX; tx++) {
        const x = ox + (tx / tilesX) * rendW;
        ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + rendH); ctx.stroke();
      }
      for (let ty = 1; ty < tilesY; ty++) {
        const y = oy + (ty / tilesY) * rendH;
        ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + rendW, y); ctx.stroke();
      }
      ctx.setLineDash([]);
      if (tilesX * tilesY > 1) {
        const label = `${tilesX}×${tilesY} = ${tilesX * tilesY} sheets`;
        const fs = Math.max(11, Math.round(canvasH * 0.042));
        ctx.font = `bold ${fs}px system-ui,sans-serif`;
        ctx.textAlign = "center";
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = "rgba(37,99,235,0.18)";
        ctx.fillRect((canvasW - tw) / 2 - 6, canvasH - fs - 12, tw + 12, fs + 8);
        ctx.fillStyle = "rgba(37,99,235,0.9)";
        ctx.fillText(label, canvasW / 2, canvasH - 8);
      }
    }
  } else if (opts.printMode === "booklet") {
    const m = opts.bookletMarginCm * CM_TO_PT * ptScale;
    const halfW = (canvasW - m * 3) / 2;
    const ph = canvasH - m * 2;
    await drawInRegion(sheetPages[0] ?? 0, m, m, halfW, ph);
    await drawInRegion(sheetPages[1] ?? 0, m * 2 + halfW, m, halfW, ph);
    ctx.strokeStyle = "rgba(60,60,60,0.2)";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(canvasW / 2, 0); ctx.lineTo(canvasW / 2, canvasH); ctx.stroke();
    ctx.setLineDash([]);
  }

  pdfJs.destroy();
  const blob = await canvasToBlob(canvas, "image/png", 0.92);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

async function buildPrintPdfBytes(
  bytes: Uint8Array,
  pages: number[],
  opts: {
    sizing: PageSizing;
    zoomPercent: number;
    grayscale: boolean;
    paperSize: string;
    orientation: string;
    printMode: PrintMode;
    pagesPerSheet: number;
    pageOrderLayout: string;
    multiMarginCm: number;
    printPageBorder: boolean;
    tileScale: number;
    tileOverlapCm: number;
    cutMarks: boolean;
    bookletSubset: string;
    bookletMarginCm: number;
  }
): Promise<Uint8Array> {
  const pdfLib = await import("pdf-lib");
  const [sheetW, sheetH] = getSheetDims(opts.paperSize, opts.orientation);

  // ── 1-page-per-sheet: rasterize via pdfjs (handles rotation correctly) ──
  if (opts.pagesPerSheet <= 1) {
    const sourcePdf = await getDocument({ data: bytes.slice() }).promise;
    try {
      const outDoc = await pdfLib.PDFDocument.create();
      // PrintScaling: None — browser will not add extra scale in print dialog
      const vpDict = outDoc.context.obj({ PrintScaling: pdfLib.PDFName.of("None") });
      outDoc.catalog.set(pdfLib.PDFName.of("ViewerPreferences"), vpDict);

      for (const pageNumber of pages) {
        const page = await sourcePdf.getPage(pageNumber);
        // getViewport accounts for page rotation → correct visual dimensions
        const vp0 = page.getViewport({ scale: 1 });
        const srcW = vp0.width;
        const srcH = vp0.height;
        const [sw, sh] = [sheetW, sheetH];
        const box = computeDrawBox(srcW, srcH, sw, sh, "fit-page", opts.zoomPercent);
        const renderScale = Math.min(3, (box.width / srcW) * 4); // quality cap ~300 DPI
        const vp = page.getViewport({ scale: Math.max(0.5, renderScale) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(vp.width));
        canvas.height = Math.max(1, Math.round(vp.height));
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (opts.grayscale) {
          const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < id.data.length; i += 4) {
            const g = Math.round(id.data[i] * 0.299 + id.data[i + 1] * 0.587 + id.data[i + 2] * 0.114);
            id.data[i] = id.data[i + 1] = id.data[i + 2] = g;
          }
          ctx.putImageData(id, 0, 0);
        }
        page.cleanup();
        const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
        if (!blob) continue;
        const imgBytes = new Uint8Array(await blob.arrayBuffer());
        const embedded = await outDoc.embedJpg(imgBytes);
        const target = outDoc.addPage([sw, sh]);
        target.drawImage(embedded, { x: box.x, y: box.y, width: box.width, height: box.height });
      }
      return new Uint8Array(await outDoc.save());
    } finally {
      sourcePdf.destroy();
    }
  }

  // ── MULTIPLE / POSTER / BOOKLET: shared rasterize helper ────────────────
  const sourcePdf = await getDocument({ data: bytes.slice() }).promise;
  const sourceDocNative = opts.grayscale ? null : await pdfLib.PDFDocument.load(bytes);
  const outDoc = await pdfLib.PDFDocument.create();

  async function rasterPage(pageNum: number, targetPx: number) {
    const page = await sourcePdf.getPage(pageNum);
    const vp0 = page.getViewport({ scale: 1 });
    const scale = Math.max(targetPx, 1) / vp0.width;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(vp.width));
    canvas.height = Math.max(1, Math.round(vp.height));
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    if (opts.grayscale) {
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < id.data.length; i += 4) {
        const g = Math.round(id.data[i] * 0.299 + id.data[i + 1] * 0.587 + id.data[i + 2] * 0.114);
        id.data[i] = id.data[i + 1] = id.data[i + 2] = g;
      }
      ctx.putImageData(id, 0, 0);
    }
    const srcW = vp0.width;
    const srcH = vp0.height;
    page.cleanup();
    const blob = await canvasToBlob(canvas, "image/png", 1);
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), srcW, srcH };
  }

  async function drawCell(
    target: ReturnType<(typeof pdfLib)["PDFDocument"]["prototype"]["addPage"]>,
    pageNum: number,
    x: number, y: number, w: number, h: number,
    border: boolean
  ) {
    if (pageNum > 0) {
      if (!opts.grayscale && sourceDocNative) {
        const sp = sourceDocNative.getPages()[pageNum - 1];
        if (sp) {
          const { width: srcW, height: srcH } = sp.getSize();
          const scale = Math.min(w / srcW, h / srcH);
          const dw = srcW * scale; const dh = srcH * scale;
          const emb = await outDoc.embedPage(sp);
          target.drawPage(emb, { x: x + (w - dw) / 2, y: y + (h - dh) / 2, width: dw, height: dh });
        }
      } else {
        const r = await rasterPage(pageNum, Math.round(w * 2));
        if (r) {
          const scale = Math.min(w / r.srcW, h / r.srcH);
          const dw = r.srcW * scale; const dh = r.srcH * scale;
          const emb = await outDoc.embedPng(r.bytes);
          target.drawImage(emb, { x: x + (w - dw) / 2, y: y + (h - dh) / 2, width: dw, height: dh });
        }
      }
    }
    if (border) {
      target.drawRectangle({ x, y, width: w, height: h, borderColor: pdfLib.rgb(0.4, 0.4, 0.4), borderWidth: 0.5 });
    }
  }

  // ── MULTIPLE (N-up) ─────────────────────────────────────────────────────
  if (opts.printMode === "multiple") {
    const [cols, rows] = getNupGrid(opts.pagesPerSheet);
    const cells = getNupCells(cols, rows, opts.pageOrderLayout);
    const m = opts.multiMarginCm * CM_TO_PT;
    // 2-up → landscape sheet; others → keep user orientation
    const [sw, sh] = opts.pagesPerSheet === 2
      ? [Math.max(sheetW, sheetH), Math.min(sheetW, sheetH)]
      : [sheetW, sheetH];
    const cellW = (sw - m * (cols + 1)) / cols;
    const cellH = (sh - m * (rows + 1)) / rows;

    for (let i = 0; i < pages.length; i += opts.pagesPerSheet) {
      const chunk = pages.slice(i, i + opts.pagesPerSheet);
      const target = outDoc.addPage([sw, sh]);
      for (let j = 0; j < opts.pagesPerSheet; j++) {
        const pageNum = chunk[j] ?? 0;
        const [row, col] = cells[j] ?? [0, 0];
        const cx = m + col * (cellW + m);
        const cy = sh - m - row * (cellH + m) - cellH;
        await drawCell(target, pageNum, cx, cy, cellW, cellH, opts.printPageBorder);
      }
    }
  }

  // ── POSTER (tile across sheets) ──────────────────────────────────────────
  else if (opts.printMode === "poster") {
    const overlapPt = opts.tileOverlapCm * CM_TO_PT;
    const scale = opts.tileScale / 100;
    for (const pageNum of pages) {
      const page = await sourcePdf.getPage(pageNum);
      const { width: srcW, height: srcH } = page.getViewport({ scale: 1 });
      page.cleanup();
      const enlargedW = srcW * scale;
      const enlargedH = srcH * scale;
      const tileW = Math.max(1, sheetW - overlapPt);
      const tileH = Math.max(1, sheetH - overlapPt);
      const tilesX = Math.max(1, Math.ceil(enlargedW / tileW));
      const tilesY = Math.max(1, Math.ceil(enlargedH / tileH));
      const r = await rasterPage(pageNum, Math.round(enlargedW * 1.5));
      if (!r) continue;
      const fullImg = await outDoc.embedPng(r.bytes);
      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const target = outDoc.addPage([sheetW, sheetH]);
          target.drawImage(fullImg, {
            x: -tx * tileW,
            y: sheetH - enlargedH + ty * tileH,
            width: enlargedW,
            height: enlargedH,
          });
          if (opts.cutMarks) {
            const len = 12; const mg = 5;
            const black = pdfLib.rgb(0, 0, 0);
            for (const [cx, cy] of [[0, 0], [sheetW, 0], [0, sheetH], [sheetW, sheetH]] as [number, number][]) {
              const sx = cx === 0 ? 1 : -1; const sy = cy === 0 ? 1 : -1;
              target.drawLine({ start: { x: cx + sx * mg, y: cy }, end: { x: cx + sx * (mg + len), y: cy }, thickness: 0.5, color: black });
              target.drawLine({ start: { x: cx, y: cy + sy * mg }, end: { x: cx, y: cy + sy * (mg + len) }, thickness: 0.5, color: black });
            }
          }
        }
      }
    }
  }

  // ── BOOKLET ──────────────────────────────────────────────────────────────
  else if (opts.printMode === "booklet") {
    const m = opts.bookletMarginCm * CM_TO_PT;
    const pairs = buildBookletOrder(pages, opts.bookletSubset);
    const bw = Math.max(sheetW, sheetH) * 2;
    const bh = Math.min(sheetW, sheetH);
    const pageW = bw / 2 - m * 1.5;
    const pageH = bh - m * 2;
    for (const [leftNum, rightNum] of pairs) {
      const target = outDoc.addPage([bw, bh]);
      await drawCell(target, leftNum,  m,           m, pageW, pageH, false);
      await drawCell(target, rightNum, bw / 2 + m / 2, m, pageW, pageH, false);
    }
  }

  sourcePdf.destroy();
  return new Uint8Array(await outDoc.save());
}

export function PrintModal({
  isOpen,
  onClose,
  fileName,
  totalPages,
  currentPage,
  selectedPages,
  docBytes,
  annotations,
  bridge,
  setViewerError,
}: PrintModalProps) {
  const [scope, setScope] = useState<PrintScope>("all");
  const [customRange, setCustomRange] = useState("");
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [grayscale, setGrayscale] = useState(false);
  const [reverseOrder, setReverseOrder] = useState(false);
  const [pageSubset, setPageSubset] = useState<PageSubset>("all");
  const [copies, setCopies] = useState(1);
  const [pageSizing, setPageSizing] = useState<PageSizing>("fit-page");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewInfo, setPreviewInfo] = useState<string>("");
  const [printMode, setPrintMode] = useState<PrintMode>("multiple");
  const [paperSize, setPaperSize] = useState("a4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [pagesPerSheet, setPagesPerSheet] = useState(1);
  const [pageOrderLayout, setPageOrderLayout] = useState<PageOrderLayout>("h");
  const [multiMargin, setMultiMargin] = useState(0.51);
  const [printPageBorder, setPrintPageBorder] = useState(false);
  const [printBothSides, setPrintBothSides] = useState(false);
  const [tileScale, setTileScale] = useState(100);
  const [tileOverlap, setTileOverlap] = useState(0.01);
  const [cutMarks, setCutMarks] = useState(false);
  const [printLabels, setPrintLabels] = useState(false);
  const [bookletSubset, setBookletSubset] = useState("both-sides");
  const [bookletBinding, setBookletBinding] = useState("left");
  const [bookletMargin, setBookletMargin] = useState(0.51);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [printers, setPrinters] = useState<{ name: string; displayName: string; isDefault: boolean }[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const previewUrlRef = useRef<string | null>(null);
  const previewRequestIdRef = useRef(0);
  const activeTileRef = useRef<HTMLButtonElement | null>(null);
  const isElectron = typeof window !== "undefined" && !!(window as any).opdf;

  useEffect(() => {
    if (isOpen) {
      setScope(selectedPages.length > 0 ? "selected" : "all");
      setCustomRange("");
      setIncludeAnnotations(true);
      setGrayscale(false);
      setReverseOrder(false);
      setPageSubset("all");
      setCopies(1);
      setPageSizing("fit-page");
      setZoomPercent(100);
      setErrorMsg(null);
      setIsProcessing(false);
      setPrintMode("multiple");
      setPaperSize("a4");
      setOrientation("portrait");
      setPagesPerSheet(1);
      setPageOrderLayout("h");
      setMultiMargin(0.51);
      setPrintPageBorder(false);
      setPrintBothSides(false);
      setTileScale(100);
      setTileOverlap(0.01);
      setCutMarks(false);
      setPrintLabels(false);
      setBookletSubset("both-sides");
      setBookletBinding("left");
      setBookletMargin(0.51);
      setPreviewIndex(0);
      if (isElectron) {
        (window as any).opdf.getPrinters().then((list: any[]) => {
          setPrinters(list);
          const def = list.find((p) => p.isDefault);
          setSelectedPrinter(def?.name ?? (list[0]?.name ?? ""));
        }).catch(() => setPrinters([]));
      }
    }
  }, [isOpen, selectedPages, isElectron]);

  const baseName = useMemo(() => fileName.split(/[/\\]/).pop() || "document.pdf", [fileName]);

  const resolvedPages = useMemo(() => {
    const basePages = getBasePages(scope, currentPage, selectedPages, customRange, totalPages);
    const subsetPages = applySubset(basePages, pageSubset);
    const orderedPages = reverseOrder ? [...subsetPages].reverse() : subsetPages;
    return expandCopies(orderedPages, clamp(copies, 1, 20));
  }, [copies, customRange, currentPage, pageSubset, reverseOrder, scope, selectedPages, totalPages]);

  const safePreviewIndex = resolvedPages.length > 0 ? Math.min(previewIndex, resolvedPages.length - 1) : 0;
  const previewPageNumber = resolvedPages[safePreviewIndex] ?? currentPage;
  const previewSummary = useMemo(() => {
    const basePages = getBasePages(scope, currentPage, selectedPages, customRange, totalPages);
    const subsetPages = applySubset(basePages, pageSubset);
    const orderedPages = reverseOrder ? [...subsetPages].reverse() : subsetPages;
    const totalSheets = orderedPages.length * clamp(copies, 1, 20);
    return {
      basePages,
      orderedPages,
      totalSheets,
      visiblePages: orderedPages.slice(0, 12),
    };
  }, [copies, customRange, currentPage, pageSubset, reverseOrder, scope, selectedPages, totalPages]);

  useEffect(() => {
    setPreviewIndex(0);
  }, [scope, customRange, pageSubset, reverseOrder, copies]);

  useEffect(() => {
    activeTileRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [safePreviewIndex]);

  const selectedPageCount = useMemo(() => uniqueSortedPages(selectedPages).length, [selectedPages]);
  const scopeOptions = useMemo(
    () => [
      {
        value: "all" as const,
        title: "All pages",
        description: "Print the full document from first page to last.",
        badge: `${totalPages} total`,
      },
      {
        value: "current" as const,
        title: `Current page (${currentPage})`,
        description: "Print only the page you are viewing right now.",
        badge: "Fastest",
      },
      ...(selectedPageCount > 0
        ? [
            {
              value: "selected" as const,
              title: `Selected pages (${selectedPageCount})`,
              description: "Print only the thumbnail pages you selected.",
              badge: "From sidebar",
            },
          ]
        : []),
      {
        value: "range" as const,
        title: "Custom page list",
        description: "Enter page numbers and ranges such as 1-3, 7.",
        badge: "Manual",
      },
    ],
    [currentPage, selectedPageCount, totalPages]
  );


  useEffect(() => {
    if (!isOpen || !docBytes || resolvedPages.length === 0) {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setPreviewUrl(null);
      setPreviewInfo("");
      return;
    }

    // Compute which source pages go on the current preview sheet
    let sheetPages: number[];
    let infoText: string;
    if (printMode === "multiple" && pagesPerSheet > 1) {
      const sheetIdx = Math.floor(safePreviewIndex / pagesPerSheet);
      const totalSheets = Math.ceil(resolvedPages.length / pagesPerSheet);
      const chunk = resolvedPages.slice(sheetIdx * pagesPerSheet, (sheetIdx + 1) * pagesPerSheet);
      while (chunk.length < pagesPerSheet) chunk.push(0);
      sheetPages = chunk;
      infoText = `Sheet ${sheetIdx + 1} / ${totalSheets}`;
    } else if (printMode === "booklet") {
      const pairs = buildBookletOrder(resolvedPages, bookletSubset);
      const spreadIdx = Math.min(safePreviewIndex, pairs.length - 1);
      const pair = pairs[spreadIdx] ?? [0, 0];
      sheetPages = [pair[0], pair[1]];
      infoText = `Spread ${spreadIdx + 1} / ${pairs.length}`;
    } else {
      sheetPages = [previewPageNumber];
      infoText = `Page ${previewPageNumber} of ${totalPages || 1}`;
    }

    const requestId = ++previewRequestIdRef.current;
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      try {
        const flattenedBytes = includeAnnotations
          ? await bridge.exportFlattened(docBytes, annotations)
          : docBytes;
        const url = await buildLivePreview(flattenedBytes, sheetPages, {
          grayscale,
          paperSize,
          orientation,
          printMode,
          pagesPerSheet,
          pageOrderLayout,
          multiMarginCm: multiMargin,
          printPageBorder,
          tileScale,
          tileOverlapCm: tileOverlap,
          bookletMarginCm: bookletMargin,
          sizing: pageSizing,
          zoomPercent,
        });
        if (cancelled || requestId !== previewRequestIdRef.current) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
        }
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setPreviewInfo(infoText);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setPreviewUrl(null);
          setPreviewInfo("");
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    annotations, bridge, docBytes, includeAnnotations, isOpen, grayscale,
    resolvedPages, safePreviewIndex, previewPageNumber, totalPages,
    printMode, paperSize, orientation, pagesPerSheet, pageOrderLayout,
    multiMargin, printPageBorder, tileScale, tileOverlap,
    bookletSubset, bookletMargin, pageSizing, zoomPercent,
  ]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  async function handlePrint() {
    if (!docBytes) return;
    if (resolvedPages.length === 0) {
      setErrorMsg("Please choose at least one page to print.");
      return;
    }

    setErrorMsg(null);
    setIsProcessing(true);
    setViewerError("Preparing print job...");

    try {
      const flattenedBytes = includeAnnotations
        ? await bridge.exportFlattened(docBytes, annotations)
        : docBytes;

      const printBytes = await buildPrintPdfBytes(flattenedBytes, resolvedPages, {
        sizing: pageSizing,
        zoomPercent,
        grayscale,
        paperSize,
        orientation,
        printMode,
        pagesPerSheet,
        pageOrderLayout,
        multiMarginCm: multiMargin,
        printPageBorder,
        tileScale,
        tileOverlapCm: tileOverlap,
        cutMarks,
        bookletSubset,
        bookletMarginCm: bookletMargin,
      });

      // Electron with specific printer: use native print API
      if (isElectron && selectedPrinter) {
        setViewerError("Sending to printer…");
        await (window as any).opdf.printPdf(printBytes, selectedPrinter);
        setViewerError(null);
        onClose();
        return;
      }

      // Web / Electron without specific printer:
      // Open PDF in a new tab and auto-trigger print.
      // The PDF already has PrintScaling:None so browser won't add extra scale.
      const blob = new Blob([printBytes as unknown as BlobPart], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      setViewerError(null);

      const printWin = window.open(blobUrl, "_blank");
      if (printWin) {
        printWin.addEventListener("load", () => {
          try { printWin.print(); } catch { /* ignore, user can Ctrl+P */ }
        });
      }
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);

      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to prepare document for printing.");
      setViewerError(null);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="premium-modal w-[min(1180px,96vw)] max-w-[1180px] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))]" style={{ width: "min(1180px, 96vw)", maxWidth: "1180px" }}>
        <div className="premium-modal-header border-b-0 bg-[linear-gradient(135deg,rgba(37,99,235,0.12),rgba(14,165,233,0.04),rgba(255,255,255,0.9))]">
          <div className="min-w-0">
            <h3 className="premium-modal-title flex items-center gap-3 text-[17px]">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#2563eb,#0ea5e9)] text-white shadow-[0_16px_28px_rgba(37,99,235,0.25)]">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block truncate">Print PDF Document</span>
                <span className="mt-1 block text-[12px] font-medium text-[var(--text-secondary)]">
                  Configure scope, layout, and preview before sending the job to the browser print dialog.
                </span>
              </span>
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[rgba(37,99,235,0.14)] bg-white/85 px-3 py-1 text-[11px] font-semibold text-[var(--text-secondary)] shadow-sm">
              Browser print
            </span>
            <button className="premium-modal-close" onClick={onClose} aria-label="Close dialog" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="premium-modal-body min-h-0" style={{ overflow: "hidden" }}>
          {errorMsg && (
            <div className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-semibold leading-6 text-red-700 shadow-sm dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              ⚠️ {errorMsg}
            </div>
          )}

          <div className="grid gap-0 rounded-[28px] border border-[var(--ui-divider)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(247,250,252,0.92))] shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)]" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <section className="overflow-y-auto border-b border-[var(--ui-divider)] bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.92))] p-5 lg:border-b-0 lg:border-r lg:p-5">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="rounded-2xl border border-[var(--ui-divider)] bg-white/90 p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Document</p>
                  <p className="mt-2 truncate text-sm font-semibold text-[var(--text-primary)]">{baseName}</p>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                    {totalPages} {totalPages === 1 ? "page" : "pages"} ready for print.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
                  <div className="rounded-2xl border border-[rgba(37,99,235,0.12)] bg-[linear-gradient(180deg,rgba(239,246,255,0.95),rgba(255,255,255,0.95))] px-4 py-3 text-left shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700/70">Active page</div>
                    <div className="mt-2 text-xl font-bold text-[var(--text-primary)]">{currentPage}</div>
                  </div>
                  <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 text-left shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Queue</div>
                    <div className="mt-2 text-xl font-bold text-[var(--text-primary)]">{previewSummary.totalSheets}</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Page scope</p>
                  <span className="rounded-full border border-[var(--border-color)] bg-white px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                    {selectedPageCount > 0 ? `${selectedPageCount} selected` : "No sidebar selection"}
                  </span>
                </div>
                <div className="grid gap-1.5">
                  {scopeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all ${
                        scope === option.value
                          ? "border-[var(--acrobat-blue)] bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(14,165,233,0.04))] shadow-sm"
                          : "border-[var(--border-color)] bg-white/85 hover:border-[rgba(37,99,235,0.35)] hover:bg-white"
                      }`}
                      onClick={() => setScope(option.value)}
                      disabled={isProcessing}
                      aria-pressed={scope === option.value}
                    >
                      <span
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                          scope === option.value ? "border-[var(--acrobat-blue)] bg-[var(--acrobat-blue)]" : "border-[var(--border-color)] bg-white"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${scope === option.value ? "bg-white" : "bg-transparent"}`} />
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-medium text-[var(--text-primary)]">{option.title}</span>
                      <span className="rounded-full bg-[var(--ui-muted-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        {option.badge}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {scope === "range" && (
                <div className="mt-3 rounded-xl border border-[var(--ui-divider)] bg-white/90 p-3 shadow-sm animate-fadeIn">
                  <label className="form-label" htmlFor="printRangeInput">
                    Enter page range
                  </label>
                  <input
                    id="printRangeInput"
                    type="text"
                    placeholder="e.g. 1-2, 4, 6"
                    className="form-control mt-2"
                    value={customRange}
                    onChange={(e) => setCustomRange(e.target.value)}
                    disabled={isProcessing}
                  />
                </div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--ui-divider)] bg-white/90 p-3 shadow-sm">
                  <label className="form-label" htmlFor="printCopies">
                    Copies
                  </label>
                  <input
                    id="printCopies"
                    type="number"
                    min={1}
                    max={20}
                    className="form-control mt-2"
                    value={copies}
                    onChange={(event) => setCopies(clamp(Number(event.target.value) || 1, 1, 20))}
                    disabled={isProcessing}
                  />
                </div>

                <div className="rounded-xl border border-[var(--ui-divider)] bg-white/90 p-3 shadow-sm">
                  <label className="form-label" htmlFor="printSubset">
                    Subset
                  </label>
                  <select
                    id="printSubset"
                    className="form-control mt-2"
                    value={pageSubset}
                    onChange={(event) => setPageSubset(event.target.value as PageSubset)}
                    disabled={isProcessing}
                  >
                    <option value="all">All pages in range</option>
                    <option value="odd">Odd pages only</option>
                    <option value="even">Even pages only</option>
                  </select>
                </div>
              </div>

              {/* Printer */}
              <div className="mt-4">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Printer</p>
                {isElectron && printers.length > 0 ? (
                  <select
                    className="form-control"
                    value={selectedPrinter}
                    onChange={(e) => setSelectedPrinter(e.target.value)}
                    disabled={isProcessing}
                  >
                    {printers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.displayName || p.name}{p.isDefault ? " (Default)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-white/80 px-3 py-2 text-[12px] text-[var(--text-secondary)]">
                    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M5 7V3h10v4M5 16H3a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2" />
                      <rect x="5" y="12" width="10" height="5" rx="1" />
                    </svg>
                    <span>{isElectron ? "Loading printers…" : "Selected in print dialog"}</span>
                  </div>
                )}
              </div>

              {/* Paper Size + Orientation */}
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Paper</p>
                  <div className="flex overflow-hidden rounded-lg border border-[var(--ui-divider)]">
                    <button
                      type="button"
                      onClick={() => setOrientation("portrait")}
                      disabled={isProcessing}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition ${orientation === "portrait" ? "bg-[var(--acrobat-blue)] text-white" : "bg-white text-[var(--text-secondary)] hover:bg-[var(--ui-muted-bg)]"}`}
                    >
                      <svg viewBox="0 0 10 14" width="9" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="0.75" y="0.75" width="8.5" height="12.5" rx="1" />
                      </svg>
                      Portrait
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrientation("landscape")}
                      disabled={isProcessing}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition ${orientation === "landscape" ? "bg-[var(--acrobat-blue)] text-white" : "bg-white text-[var(--text-secondary)] hover:bg-[var(--ui-muted-bg)]"}`}
                    >
                      <svg viewBox="0 0 14 10" width="12" height="9" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="0.75" y="0.75" width="12.5" height="8.5" rx="1" />
                      </svg>
                      Landscape
                    </button>
                  </div>
                </div>
                <select
                  className="form-control"
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value)}
                  disabled={isProcessing}
                >
                  {PAPER_SIZE_GROUPS.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.sizes.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Print Mode */}
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Print Mode</p>
                <div className="flex overflow-hidden rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-muted-bg)] p-0.5">
                  {(["multiple", "poster", "booklet"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setPrintMode(tab)}
                      disabled={isProcessing}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold capitalize transition ${
                        printMode === tab
                          ? "bg-white text-[var(--text-primary)] shadow-sm"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                <div className="mt-3 space-y-2">

                  {printMode === "multiple" && (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="form-label mb-1 block">Pages per sheet</label>
                          <select className="form-control" value={pagesPerSheet} onChange={(e) => setPagesPerSheet(Number(e.target.value))} disabled={isProcessing}>
                            {[1, 2, 4, 6, 9, 16].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                        {pagesPerSheet > 1 && (
                          <div className="mt-5 text-[12px] font-medium text-[var(--text-secondary)]">
                            {Math.ceil(Math.sqrt(pagesPerSheet))} × {Math.round(pagesPerSheet / Math.ceil(Math.sqrt(pagesPerSheet)))}
                          </div>
                        )}
                      </div>
                      {pagesPerSheet > 1 && (
                        <>
                          <div>
                            <p className="form-label mb-1.5">Page order</p>
                            <div className="flex gap-1.5">
                              {(["h", "hr", "v", "vr"] as const).map((ord) => (
                                <button
                                  key={ord}
                                  type="button"
                                  onClick={() => setPageOrderLayout(ord)}
                                  disabled={isProcessing}
                                  className={`flex h-10 w-10 items-center justify-center rounded-lg border transition ${
                                    pageOrderLayout === ord
                                      ? "border-[var(--acrobat-blue)] bg-[rgba(37,99,235,0.08)] text-[var(--acrobat-blue)]"
                                      : "border-[var(--border-color)] bg-white text-[var(--text-secondary)] hover:border-[rgba(37,99,235,0.3)]"
                                  }`}
                                >
                                  <PageOrderIcon type={ord} />
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-end gap-2">
                            <div className="flex-1">
                              <label className="form-label mb-1 block" htmlFor="multiMargin">Margin</label>
                              <input id="multiMargin" type="number" step={0.01} min={0} max={5} className="form-control" value={multiMargin} onChange={(e) => setMultiMargin(Math.max(0, Number(e.target.value) || 0))} disabled={isProcessing} />
                            </div>
                            <span className="pb-2 text-[11px] text-[var(--text-secondary)]">cm</span>
                          </div>
                        </>
                      )}
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--border-color)] bg-white/85 px-3 py-2 text-sm font-medium hover:border-[rgba(37,99,235,0.28)]">
                        <input type="checkbox" checked={printPageBorder} onChange={(e) => setPrintPageBorder(e.target.checked)} disabled={isProcessing} className="h-3.5 w-3.5 accent-blue-600" />
                        Print page border
                      </label>
                    </>
                  )}

                  {printMode === "poster" && (
                    <>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="form-label mb-1 block" htmlFor="tileScale">Tile scale</label>
                          <input id="tileScale" type="number" min={10} max={400} className="form-control" value={tileScale} onChange={(e) => setTileScale(clamp(Number(e.target.value) || 100, 10, 400))} disabled={isProcessing} />
                        </div>
                        <span className="pb-2 text-[11px] text-[var(--text-secondary)]">%</span>
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="form-label mb-1 block" htmlFor="tileOverlap">Overlap</label>
                          <input id="tileOverlap" type="number" step={0.01} min={0} max={5} className="form-control" value={tileOverlap} onChange={(e) => setTileOverlap(Math.max(0, Number(e.target.value) || 0))} disabled={isProcessing} />
                        </div>
                        <span className="pb-2 text-[11px] text-[var(--text-secondary)]">cm</span>
                      </div>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--border-color)] bg-white/85 px-3 py-2 text-sm font-medium hover:border-[rgba(37,99,235,0.28)]">
                        <input type="checkbox" checked={cutMarks} onChange={(e) => setCutMarks(e.target.checked)} disabled={isProcessing} className="h-3.5 w-3.5 accent-blue-600" />
                        Cut marks
                      </label>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--border-color)] bg-white/85 px-3 py-2 text-sm font-medium hover:border-[rgba(37,99,235,0.28)]">
                        <input type="checkbox" checked={printLabels} onChange={(e) => setPrintLabels(e.target.checked)} disabled={isProcessing} className="h-3.5 w-3.5 accent-blue-600" />
                        Labels
                      </label>
                    </>
                  )}

                  {printMode === "booklet" && (
                    <>
                      <div>
                        <label className="form-label mb-1 block" htmlFor="bookletSubset">Subset</label>
                        <select id="bookletSubset" className="form-control" value={bookletSubset} onChange={(e) => setBookletSubset(e.target.value)} disabled={isProcessing}>
                          <option value="both-sides">Both sides</option>
                          <option value="front-only">Front only</option>
                          <option value="back-only">Back only</option>
                        </select>
                      </div>
                      <div>
                        <label className="form-label mb-1 block" htmlFor="bookletBinding">Binding</label>
                        <select id="bookletBinding" className="form-control" value={bookletBinding} onChange={(e) => setBookletBinding(e.target.value)} disabled={isProcessing}>
                          <option value="left">Left</option>
                          <option value="right">Right</option>
                          <option value="top">Top</option>
                        </select>
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="form-label mb-1 block" htmlFor="bookletMargin">Margin</label>
                          <input id="bookletMargin" type="number" step={0.01} min={0} max={5} className="form-control" value={bookletMargin} onChange={(e) => setBookletMargin(Math.max(0, Number(e.target.value) || 0))} disabled={isProcessing} />
                        </div>
                        <span className="pb-2 text-[11px] text-[var(--text-secondary)]">cm</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Output options */}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--ui-divider)] bg-white/90 px-3 py-2 text-sm font-medium shadow-sm transition hover:border-[rgba(37,99,235,0.28)] hover:bg-white">
                  <input type="checkbox" checked={reverseOrder} onChange={(e) => setReverseOrder(e.target.checked)} disabled={isProcessing} className="h-3.5 w-3.5 accent-blue-600" />
                  Reverse page order
                </label>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--ui-divider)] bg-white/90 px-3 py-2 text-sm font-medium shadow-sm transition hover:border-[rgba(37,99,235,0.28)] hover:bg-white">
                  <input type="checkbox" checked={grayscale} onChange={(e) => setGrayscale(e.target.checked)} disabled={isProcessing} className="h-3.5 w-3.5 accent-blue-600" />
                  Grayscale
                </label>
              </div>

              <div className="mt-3 rounded-xl border border-[var(--ui-divider)] bg-white/90 p-3 shadow-sm">
                <label className="flex items-start gap-2.5 text-sm font-medium text-[var(--text-primary)]">
                  <input type="checkbox" checked={includeAnnotations} onChange={(e) => setIncludeAnnotations(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" disabled={isProcessing} />
                  <span>
                    Include markup annotations
                    <span className="mt-1 block text-[12px] font-normal leading-5 text-[var(--text-secondary)]">
                      Highlights, signatures, notes, and other visible markup will be merged into the print output.
                    </span>
                  </span>
                </label>
              </div>
            </section>

            <aside className="relative flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.12),rgba(255,255,255,0)_44%),linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.92))]">
              {/* Header */}
              <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-[var(--ui-divider)] px-5 py-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Live preview</p>
                  <p className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                    {previewInfo || `Page ${previewPageNumber} of ${totalPages || 1}`}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <span className="rounded-full border border-[rgba(37,99,235,0.12)] bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-blue-700 shadow-sm">
                    {previewSummary.totalSheets} sheets
                  </span>
                  <span className="rounded-full border border-[var(--ui-divider)] bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] shadow-sm">
                    {previewSummary.orderedPages.length} pages
                  </span>
                </div>
              </div>

              {/* Main preview — scrollable area */}
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {/* Image card */}
                <div className="rounded-2xl border border-[var(--ui-divider)] bg-white shadow-[0_8px_32px_rgba(15,23,42,0.10)]">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--ui-divider)] px-4 py-2.5">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Sheet preview</p>
                      <p className="text-[12px] font-semibold text-[var(--text-primary)]">{grayscale ? "Grayscale" : "Color"}</p>
                    </div>
                    <span className="rounded-full bg-[var(--ui-muted-bg)] px-2.5 py-1 text-[11px] font-semibold capitalize text-[var(--text-secondary)]">
                      {printMode}
                    </span>
                  </div>

                  <div className="flex min-h-[200px] items-center justify-center bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] p-4">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Print preview"
                        className={`max-h-[280px] w-full max-w-full object-contain ${grayscale ? "opacity-95" : ""}`}
                        style={{ filter: grayscale ? "grayscale(1)" : "none" }}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-center text-sm text-[var(--text-secondary)]">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-[var(--border-color)] bg-white shadow-sm">
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 9V2h12v7" />
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                            <rect x="6" y="14" width="12" height="8" />
                          </svg>
                        </div>
                        <span className="text-[12px]">{docBytes ? "Rendering preview..." : "Open a PDF to preview"}</span>
                      </div>
                    )}
                  </div>

                  {/* Navigation */}
                  <div className="flex items-center justify-between gap-2 border-t border-[var(--ui-divider)] px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                      disabled={safePreviewIndex === 0 || resolvedPages.length === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-color)] bg-white text-[var(--text-secondary)] transition hover:border-[rgba(37,99,235,0.4)] hover:text-[var(--acrobat-blue)] disabled:opacity-30"
                    >
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 12 L6 8 L10 4" />
                      </svg>
                    </button>
                    <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                      {resolvedPages.length > 0
                        ? `${safePreviewIndex + 1} / ${resolvedPages.length}`
                        : "No pages"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewIndex((i) => Math.min(resolvedPages.length - 1, i + 1))}
                      disabled={safePreviewIndex >= resolvedPages.length - 1 || resolvedPages.length === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-color)] bg-white text-[var(--text-secondary)] transition hover:border-[rgba(37,99,235,0.4)] hover:text-[var(--acrobat-blue)] disabled:opacity-30"
                    >
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 4 L10 8 L6 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Queue strip */}
                {resolvedPages.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                        Print queue — {resolvedPages.length} {resolvedPages.length === 1 ? "page" : "pages"}
                      </p>
                      {copies > 1 && (
                        <span className="rounded-full border border-[var(--ui-divider)] bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                          ×{copies} copies
                        </span>
                      )}
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-muted-bg)] p-2">
                      <div className="flex gap-1.5" style={{ width: "max-content" }}>
                        {resolvedPages.map((pageNum, idx) => (
                          <button
                            key={idx}
                            ref={idx === safePreviewIndex ? activeTileRef : null}
                            type="button"
                            onClick={() => setPreviewIndex(idx)}
                            className={`flex h-[44px] w-9 flex-shrink-0 flex-col items-center justify-center rounded-lg border text-center transition ${
                              idx === safePreviewIndex
                                ? "border-[var(--acrobat-blue)] bg-[rgba(37,99,235,0.12)] text-[var(--acrobat-blue)] shadow-sm"
                                : "border-[var(--border-color)] bg-white text-[var(--text-secondary)] hover:border-[rgba(37,99,235,0.3)]"
                            }`}
                          >
                            <span className="text-[11px] font-bold leading-none">{pageNum}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-[var(--ui-divider)] bg-white px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Queued</div>
                    <div className="mt-1 text-base font-bold text-[var(--text-primary)]">{previewSummary.orderedPages.length}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--ui-divider)] bg-white px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Copies</div>
                    <div className="mt-1 text-base font-bold text-[var(--text-primary)]">{copies}</div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>

        <div className="premium-modal-footer bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))]">
          <button className="btn-premium btn-premium-secondary" onClick={onClose} disabled={isProcessing} type="button">
            Cancel
          </button>
          <button className="btn-premium btn-premium-primary min-w-[140px]" onClick={handlePrint} disabled={isProcessing} type="button">
            {isProcessing ? "Preparing..." : "Print Document"}
          </button>
        </div>
      </div>
    </div>
  );
}
