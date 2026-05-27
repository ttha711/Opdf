import React, { useState, useRef, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { PageResult } from "../types";
import { sanitizeHtml } from "../lib/sanitizer";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export function usePdfToHtml(setErrorMessage: (msg: string | null) => void) {
  const [pdfPages, setPdfPages] = useState<PageResult[]>(() => {
    try {
      const saved = localStorage.getItem("pdf_to_html_pages");
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
  const translateStateRef = useRef<"idle" | "running" | "paused">("idle");
  const pdfPagesRef = useRef(pdfPages);

  // Photoshop-like AI Image Layer Editing States
  const [imageEditMode, setImageEditMode] = useState<boolean>(false);
  const [imageCropBox, setImageCropBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [croppedImageBase64, setCroppedImageBase64] = useState<string | null>(null);
  const [imageEditPrompt, setImageEditPrompt] = useState<string>("");
  const [isImageEditing, setIsImageEditing] = useState<boolean>(false);

  const pageRenderContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    pdfPagesRef.current = pdfPages;
    if (pdfPages && pdfPages.length > 0) {
      try {
        localStorage.setItem("pdf_to_html_pages", JSON.stringify(pdfPages));
      } catch (e) {
        console.warn("Failed to persist pdfPages to localStorage:", e);
      }
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

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
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

        loadedPages.push({
          pageNumber: i,
          imageUrl: b64Img,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
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
        body: JSON.stringify({ imageBase64: page.imageUrl })
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

    const concurrencyLimit = 3;
    let nextIndexPtr = 0;

    const worker = async () => {
      while (nextIndexPtr < pendingIndices.length) {
        if (translateStateRef.current !== "running") {
          break;
        }
        const targetPageIdx = pendingIndices[nextIndexPtr++];
        if (targetPageIdx !== undefined) {
          await convertSinglePage(targetPageIdx, pdfPagesRef.current);
        }
      }
    };

    const workers = Array(Math.min(concurrencyLimit, pendingIndices.length))
      .fill(null)
      .map(() => worker());

    await Promise.all(workers);

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
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const containerElement = pageRenderContainerRef.current;
      if (containerElement && containerElement.contains(range.commonAncestorContainer)) {
        const plainText = sel.toString();
        const tempDiv = document.createElement("div");
        tempDiv.appendChild(range.cloneContents());
        const htmlText = tempDiv.innerHTML;

        if (plainText.trim().length > 0) {
          setSelectedPdfSelection({
            html: htmlText,
            text: plainText,
            range: range.cloneRange()
          });
        }
      }
    }
  };

  const applyAISelectionEdit = async () => {
    if (!selectedPdfSelection || !pdfSelectionPrompt.trim()) return;
    const page = pdfPages[activePdfPageIdx];
    if (!page || !page.htmlContent) return;

    setPdfSelectionEditing(true);
    try {
      const res = await fetch("/api/edit-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          htmlContent: selectedPdfSelection.html,
          prompt: pdfSelectionPrompt,
          context: page.htmlContent.slice(0, 3000)
        })
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Không thể biên soạn phân vùng này.");
      }

      const targetSub = selectedPdfSelection.html.trim();
      let updatedString = page.htmlContent;

      if (updatedString.includes(targetSub)) {
        updatedString = updatedString.replace(targetSub, data.html);
      } else if (updatedString.includes(selectedPdfSelection.text)) {
        updatedString = updatedString.replace(selectedPdfSelection.text, data.html);
      } else {
        updatedString = updatedString.replace(selectedPdfSelection.html, data.html);
      }

      setPdfPages(prev => prev.map((p, i) => i === activePdfPageIdx ? { ...p, htmlContent: updatedString } : p));
      setSelectedPdfSelection(null);
      setPdfSelectionPrompt("");
      window.getSelection()?.removeAllRanges();
    } catch (err: any) {
      console.error("Lỗi tinh chỉnh:", err.message || err);
    } finally {
      setPdfSelectionEditing(false);
    }
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
      const label = el.getAttribute("aria-label") || "Hình ảnh tư liệu";
      
      el.className = "my-4 border border-zinc-200 rounded-xl overflow-hidden shadow-sm bg-neutral-50 p-3 block max-w-full text-center print-hidden";
      // @ts-ignore
      el.innerHTML = `
        <div class="crop-preview-box" style="position: relative; overflow: hidden; width: ${w}%; aspect-ratio: ${w}/${h}; margin: 0 auto; border-radius: 8px; border: 1px dashed rgb(228 228 231); transition: all 150ms ease;">
          <img src="${pdfPages[activePdfPageIdx]?.imageUrl}" style="position: absolute; width: ${10000 / w}%; height: ${10000 / h}%; left: -${(x * 100) / w}%; top: -${(y * 100) / h}%; max-width: none; user-select: none;" referrerPolicy="no-referrer" />
        </div>
        
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mt-3 pt-2.5 border-t border-slate-100/80">
          <div class="flex items-center gap-1.5 justify-center">
            <span class="text-xs font-bold text-slate-700">📷 ${label}</span>
          </div>

          <div class="flex items-center gap-3 justify-center">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] text-slate-400 font-bold">Rộng:</span>
              <input type="range" min="20" max="100" value="${w}" class="crop-w-slider cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none w-20 accent-indigo-600" />
              <span class="text-[10px] font-mono font-bold text-indigo-600">${w}%</span>
            </div>

            <button class="download-cropped-btn px-2.5 py-1 text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-650 rounded-lg transition-all flex items-center gap-1 cursor-pointer">
              📥 Tải ảnh về
            </button>
          </div>
        </div>
      `;

      const downloadBtn = el.querySelector(".download-cropped-btn");
      if (downloadBtn) {
        // @ts-ignore
        downloadBtn.onclick = (e) => {
          e.stopPropagation();
          const targetX = x / 100;
          const targetY = y / 100;
          const targetW = w / 100;
          const targetH = h / 100;

          const originalImgSrc = pdfPages[activePdfPageIdx]?.imageUrl;
          if (!originalImgSrc) return;

          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            const sX = img.width * targetX;
            const sY = img.height * targetY;
            const sW = img.width * targetW;
            const sH = img.height * targetH;

            canvas.width = sW;
            canvas.height = sH;

            ctx.drawImage(img, sX, sY, sW, sH, 0, 0, sW, sH);

            const dataUrl = canvas.toDataURL("image/png");
            const a = document.createElement("a");
            a.download = `${label.replace(/\s+/g, "_")}_output.png`;
            a.href = dataUrl;
            a.click();
          };
          img.src = originalImgSrc;
        };
      }

      const slider = el.querySelector(".crop-w-slider");
      if (slider) {
        // @ts-ignore
        slider.oninput = (e) => {
          const newVal = parseFloat(e.target.value);
          const previewBox = el.querySelector(".crop-preview-box") as HTMLDivElement;
          if (previewBox) {
            previewBox.style.width = `${newVal}%`;
            previewBox.style.aspectRatio = `${newVal}/${h}`;
            
            const nestedImg = previewBox.querySelector("img") as HTMLImageElement;
            if (nestedImg) {
              nestedImg.style.width = `${10000 / newVal}%`;
              nestedImg.style.height = `${10000 / h}%`;
              nestedImg.style.left = `-${(x * 100) / newVal}%`;
              nestedImg.style.top = `-${(y * 100) / h}%`;
            }
          }

          const percentLabel = slider.nextElementSibling;
          if (percentLabel) {
            percentLabel.textContent = `${newVal}%`;
          }
          el.setAttribute("data-w", String(newVal));
        };

        // @ts-ignore
        slider.onchange = () => {
          if (pageRenderContainerRef.current) {
            const editorDiv = pageRenderContainerRef.current.querySelector(".wysiwyg-editor") as HTMLDivElement;
            if (editorDiv) {
              const cloneEditor = editorDiv.cloneNode(true) as HTMLDivElement;
              const innerPlaceholders = cloneEditor.querySelectorAll(".crop-image-placeholder");
              
              innerPlaceholders.forEach(innerEl => {
                const currentW = innerEl.getAttribute("data-w");
                innerEl.removeAttribute("class");
                innerEl.removeAttribute("style");
                innerEl.innerHTML = "";
                innerEl.className = "crop-image-placeholder";
                if (currentW) innerEl.setAttribute("data-w", currentW);
              });

              setPdfPages(prev => prev.map((p, i) => i === activePdfPageIdx ? { ...p, htmlContent: cloneEditor.innerHTML } : p));
            }
          }
        };
      }
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

        loadedPages.push({
          pageNumber: i,
          imageUrl: b64Img,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
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
          title: pdfFile ? pdfFile.name.replace(".pdf", "") : "Tài liệu Phục hồi PDF" 
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
  };
}
