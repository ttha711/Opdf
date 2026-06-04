import React, { useState, useRef, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { PageResult } from "../types";
import {
  PDF_TO_HTML_STORAGE_KEY,
  serializePdfPagesForStorage,
} from "../lib/pdfToHtmlEditorGuards";
import { sanitizeHtml } from "../lib/sanitizer";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const buildDocxPageSize = (pageWidth?: number, pageHeight?: number) => {
  if (!pageWidth || !pageHeight || pageWidth <= 0 || pageHeight <= 0) {
    return undefined;
  }

  return {
    width: `${(pageWidth / 72).toFixed(2)}in`,
    height: `${(pageHeight / 72).toFixed(2)}in`,
  };
};

export function usePdfToHtml(setErrorMessage: (msg: string | null) => void) {
  const [pdfPages, setPdfPages] = useState<PageResult[]>(() => {
    try {
      const saved = localStorage.getItem(PDF_TO_HTML_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error("Local storage load pdfPages failed:", e);
    }
    return [];
  });
  
  const [activePdfPageIdx, setActivePdfPageIdx] = useState<number>(0);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0 });
  const [pdfViewerTab, setPdfViewerTab] = useState<"visual" | "code" | "compare" | "xml">("visual");

  // Selection state
  const [selectedPdfSelection, setSelectedPdfSelection] = useState<{
    html: string;
    text: string;
    range: Range | null;
  } | null>(null);
  
  const [pdfSelectionPrompt, setPdfSelectionPrompt] = useState("");
  const [pdfSelectionEditing, setPdfSelectionEditing] = useState(false);
  const [pdfTranslateState, setPdfTranslateState] = useState<"idle" | "running" | "paused">("idle");
  const [translateToVietnamese, setTranslateToVietnamese] = useState<boolean>(true);
  const [useTailwindLayout, setUseTailwindLayout] = useState<boolean>(true);
  const translateStateRef = useRef<"idle" | "running" | "paused">("idle");
  const pdfPagesRef = useRef(pdfPages);

  // Photoshop-like AI Image Layer Editing States
  const [imageEditMode, setImageEditMode] = useState<boolean>(false);
  const [imageCropBox, setImageCropBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [croppedImageBase64, setCroppedImageBase64] = useState<string | null>(null);
  const [imageEditPrompt, setImageEditPrompt] = useState<string>("");
  const [isImageEditing, setIsImageEditing] = useState<boolean>(false);

  const pageRenderContainerRef = useRef<HTMLDivElement | null>(null);
  const pageLayoutHintsRef = useRef<Record<number, Array<{ text: string; x: number; y: number; w: number; h: number }>>>({});
  const pageDigitalFlagsRef = useRef<Record<number, boolean>>({});
  const pageNonTextFlagsRef = useRef<Record<number, boolean>>({});

  const extractPageLayoutHints = async (
    page: any,
    viewport: { width: number; height: number }
  ): Promise<{
    lineHints: Array<{ text: string; x: number; y: number; w: number; h: number }>;
    isDigital: boolean;
    hasNonTextVisual: boolean;
  }> => {
    const textContent = await page.getTextContent();
    const opList = await page.getOperatorList();
    const rawItems = (textContent?.items || []) as any[];
    const lineMap = new Map<string, Array<{ text: string; x: number; y: number; w: number; h: number }>>();
    let textChars = 0;

    // Use unscaled page dimensions to calculate accurate, scale-independent percentage coordinates.
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const pageWidth = unscaledViewport.width;
    const pageHeight = unscaledViewport.height;

    for (const item of rawItems) {
      const text = String(item?.str || "").trim();
      if (!text) continue;
      textChars += text.length;
      const transform = Array.isArray(item?.transform) ? item.transform : null;
      if (!transform || transform.length < 6) continue;

      const xPx = Number(transform[4]) || 0;
      const yBaselinePx = Number(transform[5]) || 0;
      const itemWidthPx = Math.max(1, Number(item?.width) || 0);
      const itemHeightPx = Math.max(1, Math.abs(Number(transform[0])) || Math.abs(Number(transform[3])) || 10);
      const yTopPx = pageHeight - yBaselinePx - itemHeightPx;

      const x = Number(((xPx / pageWidth) * 100).toFixed(2));
      const y = Number(((Math.max(0, yTopPx) / pageHeight) * 100).toFixed(2));
      const w = Number(((itemWidthPx / pageWidth) * 100).toFixed(2));
      const h = Number(((itemHeightPx / pageHeight) * 100).toFixed(2));

      const lineKey = String(Math.round(y * 2) / 2);
      if (!lineMap.has(lineKey)) lineMap.set(lineKey, []);
      lineMap.get(lineKey)!.push({ text, x, y, w, h });
    }

    const lineHints: Array<{ text: string; x: number; y: number; w: number; h: number }> = [];
    const sortedLines = [...lineMap.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));

    for (const [, lineItems] of sortedLines) {
      const sorted = [...lineItems].sort((a, b) => a.x - b.x);
      const text = sorted.map((it) => it.text).join(" ").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const x = sorted[0].x;
      const y = Math.min(...sorted.map((it) => it.y));
      const right = Math.max(...sorted.map((it) => it.x + it.w));
      const bottom = Math.max(...sorted.map((it) => it.y + it.h));
      lineHints.push({
        text,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        w: Number((right - x).toFixed(2)),
        h: Number((bottom - y).toFixed(2)),
      });
      if (lineHints.length >= 140) break;
    }

    const ops = (opList?.fnArray || []) as number[];
    const imageOps = new Set<number>([
      (pdfjsLib as any).OPS.paintImageXObject,
      (pdfjsLib as any).OPS.paintInlineImageXObject,
      (pdfjsLib as any).OPS.paintImageMaskXObject,
      (pdfjsLib as any).OPS.paintSolidColorImageMask,
    ]);
    const vectorOps = new Set<number>([
      (pdfjsLib as any).OPS.constructPath,
      (pdfjsLib as any).OPS.stroke,
      (pdfjsLib as any).OPS.fill,
      (pdfjsLib as any).OPS.fillStroke,
      (pdfjsLib as any).OPS.shadingFill,
    ]);

    let imageCount = 0;
    let vectorCount = 0;
    for (const fn of ops) {
      if (imageOps.has(fn)) imageCount++;
      if (vectorOps.has(fn)) vectorCount++;
    }

    const hasRepeatedWordmarkRow = lineHints.some((line) => {
      const normalized = line.text.toLowerCase().replace(/\s+/g, " ").trim();
      const token = "new ★ star";
      const occurrences = normalized.split(token).length - 1;
      return occurrences >= 2 && line.w >= 20;
    });

    const isDigital = lineHints.length >= 8 && textChars >= 60;
    const hasNonTextVisual = imageCount > 0 || vectorCount >= 8 || hasRepeatedWordmarkRow;
    return { lineHints, isDigital, hasNonTextVisual };
  };

  useEffect(() => {
    pdfPagesRef.current = pdfPages;
    const serialized = serializePdfPagesForStorage(pdfPages);
    if (serialized) {
      try {
        localStorage.setItem(PDF_TO_HTML_STORAGE_KEY, serialized);
      } catch (e) {
        console.warn("Failed to persist pdfPages to localStorage:", e);
      }
      return;
    }

    try {
      localStorage.removeItem(PDF_TO_HTML_STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to clear localStorage pdf_to_html_pages:", e);
    }
  }, [pdfPages]);

  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") {
      alert("Hệ thống chỉ chấp nhận tệp có định dạng PDF.");
      return;
    }

    setPdfFile(file);
    setPdfImporting(true);
    setErrorMessage(null);
    setPdfPages([]);
    pageLayoutHintsRef.current = {};
    pageDigitalFlagsRef.current = {};
    pageNonTextFlagsRef.current = {};
    try {
      localStorage.removeItem(PDF_TO_HTML_STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to clear localStorage pdf_to_html_pages:", e);
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      setPdfProgress({ current: 0, total: totalPages });

      const loadedPages: PageResult[] = [];

      for (let i = 1; i <= totalPages; i++) {
        setPdfProgress(prev => ({ ...prev, current: i }));
        const page = await pdf.getPage(i);
        // Render at higher resolution to improve OCR fidelity for spacing/line-break/layout.
        const viewport = page.getViewport({ scale: 2.2 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        if (!ctx) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        // @ts-ignore
        await page.render({ canvasContext: ctx, viewport }).promise;
        const b64Img = canvas.toDataURL("image/jpeg", 0.96);
        const { lineHints, isDigital, hasNonTextVisual } = await extractPageLayoutHints(page, {
          width: viewport.width,
          height: viewport.height,
        });
        pageLayoutHintsRef.current[i] = lineHints;
        pageDigitalFlagsRef.current[i] = isDigital;
        pageNonTextFlagsRef.current[i] = hasNonTextVisual;

        const unscaledViewport = page.getViewport({ scale: 1.0 });
        loadedPages.push({
          pageNumber: i,
          imageUrl: b64Img,
          pageWidth: unscaledViewport.width,
          pageHeight: unscaledViewport.height,
          status: "pending"
        });
      }

      setPdfPages(loadedPages);
      setActivePdfPageIdx(0);
      setPdfTranslateState("idle");
      translateStateRef.current = "idle";
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Không thể nạp tệp PDF. Đảm bảo file không bị khoá mật khẩu.");
    } finally {
      setPdfImporting(false);
    }
  };

  const handleClosePDF = () => {
    setPdfPages([]);
    setPdfFile(null);
    setPdfProgress({ current: 0, total: 0 });
    setActivePdfPageIdx(0);
    setSelectedPdfSelection(null);
    setPdfTranslateState("idle");
    translateStateRef.current = "idle";
    pageLayoutHintsRef.current = {};
    pageDigitalFlagsRef.current = {};
    pageNonTextFlagsRef.current = {};
    try {
      localStorage.removeItem(PDF_TO_HTML_STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to clear localStorage pdf_to_html_pages:", e);
    }
  };

  const convertSinglePage = async (pageIdx: number, customPagesList?: PageResult[]) => {
    const list = customPagesList || pdfPages;
    const page = list[pageIdx];
    if (!page) return;

    setPdfPages(prev => prev.map((p, i) => i === pageIdx ? { ...p, status: "converting" } : p));
    setErrorMessage(null);

    try {
      const res = await fetch("/api/convert-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: page.imageUrl,
          layoutHints: pageLayoutHintsRef.current[page.pageNumber] || [],
          isDigitalPdf: Boolean(pageDigitalFlagsRef.current[page.pageNumber]),
          hasNonTextVisual: Boolean(pageNonTextFlagsRef.current[page.pageNumber]),
          pageWidth: page.pageWidth || 0,
          pageHeight: page.pageHeight || 0,
          translateToVietnamese,
          useTailwindLayout,
        })
      });
      const data = await res.json();
      
      if (!res.ok || data.error) {
        throw new Error(data.error || "Gặp trục trặc khi OCR dịch trang.");
      }

      setPdfPages(prev => prev.map((p, i) => i === pageIdx ? { 
        ...p, 
        status: "done", 
        htmlContent: data.html 
      } : p));
    } catch (err: any) {
      console.error(err);
      setPdfPages(prev => prev.map((p, i) => i === pageIdx ? { 
        ...p, 
        status: "error", 
        error: err.message || "Lỗi nạp dịch vụ." 
      } : p));
    }
  };

  const convertAllPages = async () => {
    if (pdfPagesRef.current.length === 0) return;
    setPdfTranslateState("running");
    translateStateRef.current = "running";

    const pendingIndices: number[] = [];
    for (let i = 0; i < pdfPagesRef.current.length; i++) {
      if (pdfPagesRef.current[i].status !== "done") {
        pendingIndices.push(i);
      }
    }

    if (pendingIndices.length === 0) {
      setPdfTranslateState("idle");
      translateStateRef.current = "idle";
      return;
    }

    // Chạy song song tối đa 3 trang đầu tiên để phản hồi nhanh
    const initialBatch = pendingIndices.slice(0, 3);
    const remaining = pendingIndices.slice(3);

    if (initialBatch.length > 0) {
      await Promise.all(
        initialBatch.map(async (idx) => {
          if (translateStateRef.current === "running") {
            await convertSinglePage(idx, pdfPagesRef.current);
          }
        })
      );
    }

    // Sau đó chạy tuần tự từng trang một đến hết để tránh spam API
    for (const idx of remaining) {
      if (translateStateRef.current !== "running") {
        break;
      }
      await convertSinglePage(idx, pdfPagesRef.current);
    }

    setPdfTranslateState("idle");
    translateStateRef.current = "idle";
  };

  const stopAllPages = () => {
    setPdfTranslateState("paused");
    translateStateRef.current = "paused";
  };

  const cancelAllPages = () => {
    setPdfTranslateState("idle");
    translateStateRef.current = "idle";
    setPdfPages(prev => prev.map(p => (p.status === "converting" || p.status === "error") ? { ...p, status: "pending" } : p));
  };

  const capturePageSelection = () => {
    if (pageRenderContainerRef.current?.dataset.suspendSelection === "true") {
      return;
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const containerElement = pageRenderContainerRef.current;
      if (containerElement && containerElement.contains(range.commonAncestorContainer)) {
        const plainText = sel.toString();
        if (plainText.trim().length > 0) {
          const tempDiv = document.createElement("div");
          tempDiv.appendChild(range.cloneContents());
          const htmlText = tempDiv.innerHTML;
          setSelectedPdfSelection({
            html: htmlText,
            text: plainText,
            range: range.cloneRange()
          });
          return;
        }
      }
    }
    setSelectedPdfSelection(null);
  };

  const getEditorDiv = () => {
    return pageRenderContainerRef.current?.querySelector(".wysiwyg-editor") as HTMLDivElement | null;
  };

  const buildSelectionReplacementHtml = (sourceHtml: string, replacementHtml: string) => {
    const sourceContainer = document.createElement("div");
    sourceContainer.innerHTML = sourceHtml.trim();
    const replacementContainer = document.createElement("div");
    replacementContainer.innerHTML = replacementHtml.trim();

    const sourceRoot = sourceContainer.firstElementChild;
    const replacementRoot = replacementContainer.firstElementChild;

    if (!sourceRoot) {
      return replacementHtml.trim();
    }

    const copyPresentationAttrs = (targetEl: Element) => {
      const attrsToCopy = ["style", "class", "dir", "lang", "align"];
      attrsToCopy.forEach((attr) => {
        const value = sourceRoot.getAttribute(attr);
        if (value !== null) {
          targetEl.setAttribute(attr, value);
        }
      });
    };

    if (replacementRoot) {
      copyPresentationAttrs(replacementRoot);
      return replacementContainer.innerHTML.trim();
    }

    const tagName = sourceRoot.tagName.toLowerCase();
    const wrapper = document.createElement(tagName === "br" ? "span" : tagName);
    copyPresentationAttrs(wrapper);
    wrapper.innerHTML = replacementHtml.trim();
    return wrapper.outerHTML;
  };

  const replaceSelectionHtml = (replacementHtml: string) => {
    const editorDiv = getEditorDiv();
    if (!editorDiv || !selectedPdfSelection) return false;

    const liveSelection = window.getSelection();
    const hasLiveSelection =
      liveSelection &&
      liveSelection.rangeCount > 0 &&
      liveSelection.toString().trim() === selectedPdfSelection.text.trim();

    const range = hasLiveSelection
      ? liveSelection!.getRangeAt(0).cloneRange()
      : selectedPdfSelection.range?.cloneRange() || null;

    const temp = document.createElement("div");
    temp.innerHTML = replacementHtml.trim();
    const fragment = document.createDocumentFragment();
    while (temp.firstChild) {
      fragment.appendChild(temp.firstChild);
    }

    if (range) {
      range.deleteContents();
      range.insertNode(fragment);
      editorDiv.normalize();
    } else {
      const targetSub = selectedPdfSelection.html.trim();
      let updatedString = editorDiv.innerHTML;

      if (updatedString.includes(targetSub)) {
        updatedString = updatedString.replace(targetSub, replacementHtml);
      } else if (updatedString.includes(selectedPdfSelection.text)) {
        updatedString = updatedString.replace(selectedPdfSelection.text, replacementHtml);
      } else {
        updatedString = updatedString.replace(selectedPdfSelection.html, replacementHtml);
      }

      editorDiv.innerHTML = updatedString;
    }

    setPdfPages(prev =>
      prev.map((p, i) => (i === activePdfPageIdx ? { ...p, htmlContent: editorDiv.innerHTML } : p))
    );
    return true;
  };

  const runSelectionEdit = async (prompt: string, preservePresentation = false) => {
    if (!selectedPdfSelection || !prompt.trim()) return;
    const page = pdfPages[activePdfPageIdx];
    if (!page || !page.htmlContent) return;

    setPdfSelectionEditing(true);
    try {
      const res = await fetch("/api/edit-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          htmlContent: selectedPdfSelection.html,
          prompt,
          context: page.htmlContent.slice(0, 3000)
        })
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Không thể biên soạn phân vùng này.");
      }

      const replacementHtml = preservePresentation
        ? buildSelectionReplacementHtml(selectedPdfSelection.html, data.html)
        : data.html;

      const replaced = replaceSelectionHtml(replacementHtml);
      if (!replaced) {
        throw new Error("Không thể thay thế vùng chọn hiện tại.");
      }

      setSelectedPdfSelection(null);
      setPdfSelectionPrompt("");
      window.getSelection()?.removeAllRanges();
    } catch (err: any) {
      console.error("Lỗi tinh chỉnh:", err.message || err);
    } finally {
      setPdfSelectionEditing(false);
    }
  };

  const applyAISelectionEdit = async () => {
    await runSelectionEdit(pdfSelectionPrompt);
  };

  const applyAISelectionTranslate = async () => {
    await runSelectionEdit(
      "Translate the selected HTML fragment into natural Vietnamese if the source text is not Vietnamese, otherwise translate it into natural English. Preserve the exact HTML structure, background styling, font family, font size, font weight, text color, spacing, and alignment. Only change the text content. Return only raw HTML.",
      true
    );
  };

  // Helper to trigger crop live adjustments inside rendered containers
  useEffect(() => {
    if (!pageRenderContainerRef.current) return;
    const placeholders = pageRenderContainerRef.current.querySelectorAll(".crop-image-placeholder");
    
    placeholders.forEach((el) => {
      const x = parseFloat(el.getAttribute("data-x") || "0");
      const y = parseFloat(el.getAttribute("data-y") || "0");
      let w = parseFloat(el.getAttribute("data-w") || "100");
      const h = parseFloat(el.getAttribute("data-h") || "100");
      const offsetX = parseFloat(el.getAttribute("data-offset-x") || "0");
      const offsetY = parseFloat(el.getAttribute("data-offset-y") || "0");
      // Prevent contenteditable from deleting/mutating placeholder node during drag resize.
      (el as HTMLElement).setAttribute("contenteditable", "false");
      
      // Minimal image-only placeholder: no extra controls/text panel.
      el.className = "my-4 inline-block align-top text-center print-hidden relative";
      (el as HTMLElement).style.width = `${w}%`;
      (el as HTMLElement).style.minWidth = "120px";
      (el as HTMLElement).style.maxWidth = "100%";
      (el as HTMLElement).style.overflow = "visible";
      (el as HTMLElement).style.position = "relative";
      (el as HTMLElement).style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      (el as HTMLElement).style.cursor = "move";

      el.innerHTML = `
        <div class="crop-preview-box" style="position: relative; overflow: hidden; width: 100%; aspect-ratio: ${w}/${h}; margin: 0 auto; border-radius: 10px; border: 1px dashed rgb(228 228 231); transition: all 150ms ease;">
          <img src="${pdfPages[activePdfPageIdx]?.imageUrl}" style="position: absolute; width: ${10000 / w}%; height: ${10000 / h}%; left: -${(x * 100) / w}%; top: -${(y * 100) / h}%; max-width: none; user-select: none;" referrerPolicy="no-referrer" />
        </div>
        <div class="crop-resize-handle" title="Kéo để đổi kích thước" style="position:absolute;right:-2px;bottom:-2px;width:20px;height:20px;border-right:2px solid #64748b;border-bottom:2px solid #64748b;border-radius:0 0 10px 0;cursor:nwse-resize;background:linear-gradient(135deg, transparent 0%, transparent 55%, rgba(100,116,139,0.12) 100%);"></div>
      `;

      const persistPlaceholderLayout = () => {
        if (!pageRenderContainerRef.current) return;
        const editorDiv = pageRenderContainerRef.current.querySelector(".wysiwyg-editor") as HTMLDivElement;
        if (!editorDiv) return;
        const cloneEditor = editorDiv.cloneNode(true) as HTMLDivElement;
        const innerPlaceholders = cloneEditor.querySelectorAll(".crop-image-placeholder");
        innerPlaceholders.forEach(innerEl => {
          const currentW = innerEl.getAttribute("data-w");
          const dx = innerEl.getAttribute("data-x");
          const dy = innerEl.getAttribute("data-y");
          const dh = innerEl.getAttribute("data-h");
          const dox = innerEl.getAttribute("data-offset-x");
          const doy = innerEl.getAttribute("data-offset-y");
          innerEl.removeAttribute("class");
          innerEl.removeAttribute("style");
          innerEl.innerHTML = "";
          innerEl.className = "crop-image-placeholder";
          if (currentW) innerEl.setAttribute("data-w", currentW);
          if (dx) innerEl.setAttribute("data-x", dx);
          if (dy) innerEl.setAttribute("data-y", dy);
          if (dh) innerEl.setAttribute("data-h", dh);
          if (dox) innerEl.setAttribute("data-offset-x", dox);
          if (doy) innerEl.setAttribute("data-offset-y", doy);
        });
        setPdfPages(prev => prev.map((p, i) => i === activePdfPageIdx ? { ...p, htmlContent: cloneEditor.innerHTML } : p));
      };

      const host = el as HTMLElement;
      const previewBox = host.querySelector(".crop-preview-box") as HTMLDivElement | null;
      if (previewBox) {
        previewBox.addEventListener("mousedown", (ev: MouseEvent) => {
          if ((ev.target as HTMLElement).closest(".crop-resize-handle")) return;
          ev.preventDefault();
          ev.stopPropagation();
          const startX = ev.clientX;
          const startY = ev.clientY;
          const startOffsetX = parseFloat(host.getAttribute("data-offset-x") || "0");
          const startOffsetY = parseFloat(host.getAttribute("data-offset-y") || "0");

          const onMove = (moveEv: MouseEvent) => {
            const nextX = startOffsetX + (moveEv.clientX - startX);
            const nextY = startOffsetY + (moveEv.clientY - startY);
            host.style.transform = `translate(${nextX}px, ${nextY}px)`;
            host.setAttribute("data-offset-x", nextX.toFixed(1));
            host.setAttribute("data-offset-y", nextY.toFixed(1));
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            persistPlaceholderLayout();
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        });
      }

      const handle = el.querySelector(".crop-resize-handle") as HTMLDivElement | null;
      if (handle) {
        const onMouseDown = (ev: MouseEvent) => {
          ev.preventDefault();
          ev.stopPropagation();
          const parent = host.parentElement as HTMLElement | null;
          if (!parent) return;
          const startX = ev.clientX;
          const startWidth = host.getBoundingClientRect().width;
          const parentWidth = parent.getBoundingClientRect().width || 1;

          const onMove = (moveEv: MouseEvent) => {
            const delta = moveEv.clientX - startX;
            const nextPx = Math.max(120, startWidth + delta);
            const nextPercent = Math.max(20, Math.min(100, (nextPx / parentWidth) * 100));
            host.style.width = `${nextPercent}%`;
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            const finalPercent = Math.max(20, Math.min(100, (host.getBoundingClientRect().width / parentWidth) * 100));
            host.setAttribute("data-w", finalPercent.toFixed(1));
            persistPlaceholderLayout();
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        };
        handle.addEventListener("mousedown", onMouseDown);
      }

      const persistResizedWidth = () => {
        const parent = host.parentElement as HTMLElement | null;
        if (!parent) return;
        const percent = Math.max(20, Math.min(100, (host.getBoundingClientRect().width / parent.getBoundingClientRect().width) * 100));
        host.style.width = `${percent}%`;
        host.setAttribute("data-w", percent.toFixed(1));
      };

      el.addEventListener("mouseup", persistResizedWidth);
      el.addEventListener("touchend", persistResizedWidth);
    });
  }, [pdfPages, activePdfPageIdx, pdfViewerTab]);

  const [isExporting, setIsExporting] = useState<string | null>(null);

  const loadPdfFromBytes = async (bytes: Uint8Array, name: string) => {
    setPdfFile(new File([bytes], name, { type: "application/pdf" }));
    setPdfImporting(true);
    setErrorMessage(null);
    setPdfPages([]);

    try {
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const totalPages = pdf.numPages;
      setPdfProgress({ current: 0, total: totalPages });

      const loadedPages: PageResult[] = [];

      for (let i = 1; i <= totalPages; i++) {
        setPdfProgress(prev => ({ ...prev, current: i }));
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 }); // optimized render resolution
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        if (!ctx) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        // @ts-ignore
        await page.render({ canvasContext: ctx, viewport }).promise;
        const b64Img = canvas.toDataURL("image/jpeg", 0.85);

        const { lineHints, isDigital, hasNonTextVisual } = await extractPageLayoutHints(page, {
          width: viewport.width,
          height: viewport.height,
        });
        pageLayoutHintsRef.current[i] = lineHints;
        pageDigitalFlagsRef.current[i] = isDigital;
        pageNonTextFlagsRef.current[i] = hasNonTextVisual;

        const unscaledViewport = page.getViewport({ scale: 1.0 });
        loadedPages.push({
          pageNumber: i,
          imageUrl: b64Img,
          pageWidth: unscaledViewport.width,
          pageHeight: unscaledViewport.height,
          status: "pending"
        });
      }

      setPdfPages(loadedPages);
      setActivePdfPageIdx(0);
      setPdfTranslateState("idle");
      translateStateRef.current = "idle";
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Không thể nạp tệp PDF. Đảm bảo file không bị khoá mật khẩu.");
    } finally {
      setPdfImporting(false);
    }
  };

  const exportPDFToWord = async () => {
    const parsedHtmls = pdfPages
      .filter(p => p.status === "done" && p.htmlContent)
      .map(p => `<!-- PAGE ${p.pageNumber} -->\n${p.htmlContent}`)
      .join("\n<br style=\"page-break-before: always;\" />\n");
    const sourcePage = pdfPages.find(
      (p) => p.status === "done" && p.htmlContent && p.pageWidth && p.pageHeight
    );
    const pageSize = buildDocxPageSize(sourcePage?.pageWidth, sourcePage?.pageHeight);

    if (!parsedHtmls.trim()) {
      alert("Chưa có trang nào được dịch thành công để xuất tài liệu.");
      return;
    }

    setIsExporting("docx");
    try {
      const res = await fetch("/api/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          html: parsedHtmls, 
          title: pdfFile ? pdfFile.name.replace(".pdf", "") : "Tài liệu Phục hồi PDF",
          pageSize,
        })
      });

      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pdfFile ? pdfFile.name.replace(".pdf", "") : "pdf_converted"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Lỗi xuất tài liệu. Hãy rà soát mạng hoặc file.");
    } finally {
      setIsExporting(null);
    }
  };

  const applyImageRegionEdit = async () => {
    if (!croppedImageBase64 || !imageEditPrompt.trim() || !imageCropBox) return;
    const page = pdfPages[activePdfPageIdx];
    if (!page) return;

    setIsImageEditing(true);
    try {
      const res = await fetch("/api/edit-image-region", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: croppedImageBase64,
          prompt: imageEditPrompt
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Gặp lỗi khi xử lý ảnh qua AI.");
      }

      // Now we perform the draw back on the main page image
      const mainImg = new Image();
      mainImg.src = page.imageUrl;
      await new Promise((resolve, reject) => {
        mainImg.onload = resolve;
        mainImg.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      canvas.width = mainImg.width;
      canvas.height = mainImg.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Không khởi tạo được Canvas Context");

      // Draw original image first
      ctx.drawImage(mainImg, 0, 0);

      // Now prepare the cropped region editing on a temporary canvas
      const cropW = (imageCropBox.w / 100) * mainImg.width;
      const cropH = (imageCropBox.h / 100) * mainImg.height;
      const cropX = (imageCropBox.x / 100) * mainImg.width;
      const cropY = (imageCropBox.y / 100) * mainImg.height;

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = cropW;
      cropCanvas.height = cropH;
      const cropCtx = cropCanvas.getContext("2d");
      if (!cropCtx) throw new Error("Không thể tạo canvas phụ.");

      // First load cropped image into cropCanvas
      const origCropImg = new Image();
      origCropImg.src = croppedImageBase64;
      await new Promise((resolve) => { origCropImg.onload = resolve; });
      cropCtx.drawImage(origCropImg, 0, 0, cropW, cropH);

      if (data.type === "text_edit") {
        // AI returned specific text edit coordinates
        // Clear/paint background
        cropCtx.fillStyle = data.clearColor || "#FFFFFF";
        
        // Draw background rectangle to clear old text
        cropCtx.fillRect(
          (data.x - data.w / 2) * cropW / 100, 
          (data.y - data.h / 2 - 5) * cropH / 100, 
          data.w * cropW / 100, 
          data.h * cropH / 100
        );

        // Draw new text
        cropCtx.fillStyle = data.textColor || "#000000";
        const fontW = data.fontWeight || "normal";
        const fontF = data.fontFamily || "sans-serif";
        const fontS = data.fontSize || 14;
        cropCtx.font = `${fontW} ${fontS}px ${fontF}`;
        cropCtx.textBaseline = "middle";
        cropCtx.textAlign = "center";
        
        cropCtx.fillText(
          data.text,
          data.x * cropW / 100,
          data.y * cropH / 100
        );
      } else {
        // Fallback/general edit prompt text
        cropCtx.fillStyle = "rgba(240, 240, 240, 0.9)";
        cropCtx.fillRect(0, 0, cropW, cropH);
        cropCtx.fillStyle = "#374151";
        cropCtx.font = "bold 12px sans-serif";
        cropCtx.textAlign = "center";
        cropCtx.textBaseline = "middle";
        cropCtx.fillText("[AI Edited Block]", cropW / 2, cropH / 2 - 10);
        cropCtx.font = "normal 10px sans-serif";
        cropCtx.fillText(data.prompt || prompt, cropW / 2, cropH / 2 + 10);
      }

      // Draw edited cropCanvas back onto main canvas
      ctx.drawImage(cropCanvas, cropX, cropY, cropW, cropH);

      const newImageUrl = canvas.toDataURL("image/jpeg", 0.85);

      setPdfPages(prev => prev.map((p, i) => i === activePdfPageIdx ? {
        ...p,
        imageUrl: newImageUrl
      } : p));

      // Reset crop states
      setCroppedImageBase64(null);
      setImageCropBox(null);
      setImageEditPrompt("");
    } catch (err: any) {
      console.error(err);
      alert("Lỗi khi sửa ảnh bằng AI: " + (err.message || err));
    } finally {
      setIsImageEditing(false);
    }
  };

  return {
    pdfPages,
    setPdfPages,
    activePdfPageIdx,
    setActivePdfPageIdx,
    pdfFile,
    setPdfFile,
    pdfImporting,
    pdfProgress,
    pdfViewerTab,
    setPdfViewerTab,
    selectedPdfSelection,
    setSelectedPdfSelection,
    pdfSelectionPrompt,
    setPdfSelectionPrompt,
    pdfSelectionEditing,
    pdfTranslateState,
    pageRenderContainerRef,
    isExporting,
    handlePDFUpload,
    handleClosePDF,
    convertSinglePage,
    convertAllPages,
    stopAllPages,
    cancelAllPages,
    capturePageSelection,
    applyAISelectionEdit,
    applyAISelectionTranslate,
    exportPDFToWord,
    loadPdfFromBytes,

    // Photoshop Image Layer Edit States
    imageEditMode,
    setImageEditMode,
    imageCropBox,
    setImageCropBox,
    croppedImageBase64,
    setCroppedImageBase64,
    imageEditPrompt,
    setImageEditPrompt,
    isImageEditing,
    applyImageRegionEdit,

    // Translation and slide layout options
    translateToVietnamese,
    setTranslateToVietnamese,
    useTailwindLayout,
    setUseTailwindLayout,
  };
}
