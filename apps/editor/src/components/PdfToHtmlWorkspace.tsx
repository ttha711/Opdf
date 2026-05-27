import React from "react";
import { 
  Sparkles, 
  Compass, 
  Loader2, 
  FileText, 
  Download, 
  RefreshCw 
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { PageResult } from "../types";
import { cn } from "../lib/utils";

// Import modular sub-components
import PdfToHtmlLeftSidebar from "./PdfToHtmlLeftSidebar";
import PdfToHtmlRightSidebar from "./PdfToHtmlRightSidebar";
import PdfToHtmlWysiwygToolbar from "./PdfToHtmlWysiwygToolbar";

// Configure pdfjs worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
}

interface PdfToHtmlWorkspaceProps {
  pdfPages: PageResult[];
  setPdfPages: React.Dispatch<React.SetStateAction<PageResult[]>>;
  activePdfPageIdx: number;
  setActivePdfPageIdx: (idx: number) => void;
  pdfFile: File | null;
  pdfImporting: boolean;
  pdfProgress: { current: number; total: number };
  selectedPdfSelection: {
    html: string;
    text: string;
    range: Range | null;
  } | null;
  setSelectedPdfSelection: (sel: any) => void;
  pdfSelectionPrompt: string;
  setPdfSelectionPrompt: (val: string) => void;
  pdfSelectionEditing: boolean;
  pdfTranslateState: "idle" | "running" | "paused";
  pdfViewerTab: "visual" | "compare" | "xml" | "image_edit";
  setPdfViewerTab: (tab: "visual" | "compare" | "xml" | "image_edit") => void;
  handlePDFUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  convertSinglePage: (idx: number) => void;
  convertAllPages: () => void;
  stopAllPages: () => void;
  cancelAllPages: () => void;
  capturePageSelection: () => void;
  applyAISelectionEdit: () => void;
  exportPDFToWord: () => void;
  handlePrint: () => void;
  pageRenderContainerRef: React.RefObject<HTMLDivElement | null>;
  handleClosePDF: () => void;
  updatePdfPageHtml: (idx: number, htmlContent: string) => void;

  // AI Image Layer Edit Props
  imageEditMode?: boolean;
  setImageEditMode?: (val: boolean) => void;
  imageCropBox?: { x: number; y: number; w: number; h: number } | null;
  setImageCropBox?: (val: any) => void;
  croppedImageBase64?: string | null;
  setCroppedImageBase64?: (val: string | null) => void;
  imageEditPrompt?: string;
  setImageEditPrompt?: (val: string) => void;
  isImageEditing?: boolean;
  applyImageRegionEdit?: () => void;
}

export default function PdfToHtmlWorkspace({
  pdfPages,
  setPdfPages,
  activePdfPageIdx,
  setActivePdfPageIdx,
  pdfFile,
  pdfImporting,
  pdfProgress,
  selectedPdfSelection,
  setSelectedPdfSelection,
  pdfSelectionPrompt,
  setPdfSelectionPrompt,
  pdfSelectionEditing,
  pdfTranslateState,
  pdfViewerTab,
  setPdfViewerTab,
  handlePDFUpload,
  convertSinglePage,
  convertAllPages,
  stopAllPages,
  cancelAllPages,
  capturePageSelection,
  applyAISelectionEdit,
  exportPDFToWord,
  handlePrint,
  pageRenderContainerRef,
  handleClosePDF,
  updatePdfPageHtml,

  // New Image edit props
  imageEditMode,
  setImageEditMode,
  imageCropBox,
  setImageCropBox,
  croppedImageBase64,
  setCroppedImageBase64,
  imageEditPrompt,
  setImageEditPrompt,
  isImageEditing,
  applyImageRegionEdit
}: PdfToHtmlWorkspaceProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = React.useState(false);

  const [showRawHtml, setShowRawHtml] = React.useState(false);
  const [rawHtmlText, setRawHtmlText] = React.useState("");

  // State for appending additional files
  const [isAppendingFiles, setIsAppendingFiles] = React.useState(false);
  const [appendProgress, setAppendProgress] = React.useState({ current: 0, total: 0 });

  // XML Semantic state handlers
  const [isGeneratingXml, setIsGeneratingXml] = React.useState(false);

  // Sync raw HTML when switching active page
  React.useEffect(() => {
    const page = pdfPages[activePdfPageIdx];
    if (page && page.htmlContent) {
      setRawHtmlText(page.htmlContent);
    }
  }, [activePdfPageIdx, pdfPages]);

  const generateSemanticXml = async (idx: number) => {
    const page = pdfPages[idx];
    if (!page || !page.htmlContent) return;
    setIsGeneratingXml(true);
    try {
      const res = await fetch("/api/html-to-xml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ htmlContent: page.htmlContent })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Gặp lỗi khi tạo cấu trúc XML ngữ nghĩa.");
      }
      setPdfPages(prev => prev.map((p, i) => i === idx ? { ...p, xmlContent: data.xml } : p));
    } catch (err: any) {
      alert("Lỗi kết nối bộ sinh XML: " + (err.message || err));
    } finally {
      setIsGeneratingXml(false);
    }
  };

  const downloadXmlFile = (idx: number) => {
    const page = pdfPages[idx];
    if (!page || !page.xmlContent) return;
    const blob = new Blob([page.xmlContent], { type: "application/xml;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trang_${page.pageNumber}_semantic_model.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 1. PAGE MANIPULATION CALLBACKS
  const handleAddEmptyPage = () => {
    const newPageNum = pdfPages.length + 1;
    const emptyPageImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='820' style='background:%23f8fafc'><rect width='100%' height='100%' fill='%23ffffff' stroke='%23e2e8f0' stroke-width='4'/><text x='50%' y='40%' dominant-baseline='middle' text-anchor='middle' fill='%236366f1' font-family='sans-serif' font-weight='bold' font-size='15'>Trang trống</text><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-family='sans-serif' font-size='12'>Trang được tạo thủ công</text></svg>";
    
    const newPage: PageResult = {
      pageNumber: newPageNum,
      imageUrl: emptyPageImg,
      pageWidth: 600,
      pageHeight: 820,
      htmlContent: "<p style='color: #64748b;'><i>Nhấp vào đây để thêm nội dung trống của bạn...</i></p>",
      status: "done"
    };

    setPdfPages(prev => [...prev, newPage]);
    setTimeout(() => {
      setActivePdfPageIdx(pdfPages.length);
    }, 50);
  };

  const handleClonePage = (idx: number) => {
    const pageToClone = pdfPages[idx];
    if (!pageToClone) return;

    const clonedPage: PageResult = {
      ...pageToClone,
      pageNumber: pdfPages.length + 1,
      status: pageToClone.status === "converting" ? "pending" : pageToClone.status
    };

    const updatedPages = [...pdfPages];
    updatedPages.splice(idx + 1, 0, clonedPage);

    // Re-index pages
    const reindexed = updatedPages.map((p, i) => ({ ...p, pageNumber: i + 1 }));
    setPdfPages(reindexed);
    setActivePdfPageIdx(idx + 1);
  };

  const handleDeletePage = (idx: number) => {
    if (pdfPages.length <= 1) {
      alert("Tài liệu của bạn phải có ít nhất 1 trang!");
      return;
    }
    if (!window.confirm(`Bạn có đồng ý xóa Trang số ${idx + 1} khỏi tài liệu này không?`)) {
      return;
    }

    const updatedPages = pdfPages.filter((_, i) => i !== idx);
    const reindexed = updatedPages.map((p, i) => ({ ...p, pageNumber: i + 1 }));

    setPdfPages(reindexed);
    
    if (activePdfPageIdx >= reindexed.length) {
      setActivePdfPageIdx(reindexed.length - 1);
    } else if (activePdfPageIdx === idx) {
      setActivePdfPageIdx(Math.max(0, idx - 1));
    }
  };

  const handleMovePage = (idx: number, direction: "up" | "down") => {
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === pdfPages.length - 1) return;

    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const updatedPages = [...pdfPages];
    
    const temp = updatedPages[idx];
    updatedPages[idx] = updatedPages[targetIdx];
    updatedPages[targetIdx] = temp;

    const reindexed = updatedPages.map((p, i) => ({ ...p, pageNumber: i + 1 }));
    setPdfPages(reindexed);
    setActivePdfPageIdx(targetIdx);
  };

  // 2. APPEND MORE FILES INTERFACE METHOD
  const handleAppendIncomingFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    
    setIsAppendingFiles(true);
    setAppendProgress({ current: 0, total: files.length });

    const currentPagesCount = pdfPages.length;
    const newPages: PageResult[] = [];

    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      const file = files[fIdx];
      setAppendProgress(prev => ({ ...prev, current: fIdx + 1 }));

      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const pagesCount = pdf.numPages;

          for (let i = 1; i <= pagesCount; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            // @ts-ignore
            await page.render({ canvasContext: ctx, viewport }).promise;
            const b64Img = canvas.toDataURL("image/jpeg", 0.85);

            newPages.push({
              pageNumber: currentPagesCount + newPages.length + 1,
              imageUrl: b64Img,
              pageWidth: viewport.width,
              pageHeight: viewport.height,
              status: "pending"
            });
          }
        } catch (err) {
          console.error("Lỗi đọc PDF đính kèm:", err);
          alert(`Không thể nạp tệp PDF: ${file.name}. Có thể tệp bị lỗi hoặc có mật khẩu khóa.`);
        }
      }
      else if (file.type.startsWith("image/")) {
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const b64Img = event.target?.result as string;
            newPages.push({
              pageNumber: currentPagesCount + newPages.length + 1,
              imageUrl: b64Img,
              pageWidth: 800,
              pageHeight: 1100,
              htmlContent: `<div style="text-align: center; margin: 1.5rem 0;"><img src="${b64Img}" alt="Ảnh được chèn" style="max-width:105%; height:auto; border-radius:12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);" /><p style="color: #64748b; font-size: 11px; margin-top: 4px;"><i>Hình ảnh chèn thêm: ${file.name}</i></p></div>`,
              status: "done"
            });
            resolve();
          };
          reader.readAsDataURL(file);
        });
      }
      else if (file.type === "text/plain" || file.type === "text/html" || file.name.endsWith(".html") || file.name.endsWith(".txt")) {
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const fileContent = event.target?.result as string;
            const isHtml = file.name.endsWith(".html") || file.type === "text/html";
            const htmlVal = isHtml
              ? fileContent 
              : fileContent.split("\n\n").map(para => `<p style="margin-bottom: 1em;">${para.replace(/\n/g, "<br/>")}</p>`).join("");
               
            const emptyPageImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='800' style='background:%23fafafa'><rect width='100%' height='100%' fill='white' stroke='%23e2e8f0' stroke-width='4'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%236366f1' font-family='sans-serif' font-weight='bold' font-size='14'>Đính Kèm Văn Bản</text></svg>";
            
            newPages.push({
              pageNumber: currentPagesCount + newPages.length + 1,
              imageUrl: emptyPageImg,
              pageWidth: 600,
              pageHeight: 800,
              htmlContent: `<div style="padding: 1rem; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc; margin-bottom: 1.5rem;"><h3 style="color: #4f46e5; margin-top: 0;">📎 Tệp đính kèm: ${file.name}</h3><hr style="margin: 0.5rem 0; border: 0; border-top: 1px solid #cbd5e1" />${htmlVal}</div>`,
              status: "done"
            });
            resolve();
          };
          reader.readAsText(file);
        });
      }
    }

    if (newPages.length > 0) {
      setPdfPages(prev => [...prev, ...newPages]);
      setActivePdfPageIdx(currentPagesCount);
    }
    setIsAppendingFiles(false);
  };

  return (
    <div className="flex flex-col flex-grow overflow-hidden bg-slate-50/50 h-[calc(100vh-3.5rem)] w-full select-none">
      
      {/* CORE TRIPLE SPLIT WORKSPACE BODY */}
      <div className="flex-grow flex flex-col lg:flex-row overflow-hidden w-full h-full">
        
        {/* LEFT SIDEBOARD: FILE UPLOAD AND PAGE GRID LIST */}
        <PdfToHtmlLeftSidebar 
          pdfPages={pdfPages}
          activePdfPageIdx={activePdfPageIdx}
          setActivePdfPageIdx={setActivePdfPageIdx}
          pdfFile={pdfFile}
          pdfImporting={pdfImporting}
          pdfProgress={pdfProgress}
          pdfTranslateState={pdfTranslateState}
          isSidebarCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          isAppendingFiles={isAppendingFiles}
          appendProgress={appendProgress}
          handleClosePDF={handleClosePDF}
          handlePDFUpload={handlePDFUpload}
          handleAppendIncomingFiles={handleAppendIncomingFiles}
          convertSinglePage={convertSinglePage}
          convertAllPages={convertAllPages}
          stopAllPages={stopAllPages}
          cancelAllPages={cancelAllPages}
          setSelectedPdfSelection={setSelectedPdfSelection}
          handleMovePage={handleMovePage}
          handleClonePage={handleClonePage}
          handleDeletePage={handleDeletePage}
          handleAddEmptyPage={handleAddEmptyPage}
        />

        {/* MID PANEL: EDITABLE SHEET CANVAS VIEWPORT */}
        <section className="flex-grow flex-1 bg-slate-105/50 border-r border-slate-200 flex flex-col overflow-hidden h-full">
          <div className="flex-1 overflow-y-auto p-6 lg:p-8 flex items-start justify-center">
            {pdfPages.length === 0 ? (
              <div className="max-w-md w-full text-center py-16 space-y-5">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-150 text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
                  <Sparkles className="w-6 h-6 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-slate-800 uppercase tracking-wide">Trình Dịch Tài Liệu PDF Sang Văn Bản</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Tải lên tài liệu PDF hoặc trang quét biên dịch để phục hồi cấu trúc Word, bảng dự thầu, sơ đồ và ảnh tư liệu cực kỳ nhanh chóng.
                  </p>
                </div>
                <div className="p-4 bg-white border border-slate-200 rounded-xl text-left space-y-2.5">
                  <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Lợi ích công nghệ:</span>
                  <ul className="text-xs text-slate-600 space-y-2">
                    <li className="flex items-center gap-2">✓ Bản dịch chuẩn chỉnh phong cách hành chính</li>
                    <li className="flex items-center gap-2">✓ Cắt xén vùng đồ họa thông minh</li>
                    <li className="flex items-center gap-2">✓ Bôi đen để tự động tinh chỉnh văn bản</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-3xl space-y-6">
                {pdfViewerTab === "visual" && (
                  <div className="space-y-4">
                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-700 flex items-start gap-2 select-none font-medium leading-relaxed">
                      <Sparkles className="w-4 h-4 text-indigo-650 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>Mẹo biên tập:</strong> Hãy di chuyển và <strong>quét chuột bôi đen</strong> cụm từ bất kỳ trực tiếp trên trang tài liệu bên dưới để mở rộng hộp công cụ sửa đổi ở bên phải!
                      </span>
                    </div>

                    {(() => {
                      const page = pdfPages[activePdfPageIdx];
                      if (!page) return null;
                      if (page.status !== "done") {
                        return (
                          <div className="w-full min-h-[450px] bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center text-center p-6">
                            {page.status === "pending" ? (
                              <Compass className="w-10 h-10 text-slate-300 mb-2" />
                            ) : page.status === "converting" ? (
                              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-2" />
                            ) : (
                              <Compass className="w-10 h-10 text-red-400 mb-2" />
                            )}
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                              {page.status === "pending" ? "Trang này chưa được đồng bộ dữ liệu" : page.status === "converting" ? "Hệ thống đang dựng cấu trúc tài liệu..." : "Lỗi biên dịch trang"}
                            </h4>
                            <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
                              {page.status === "pending" && "Chọn nút 'Đọc dữ liệu' ở trang tương ứng tại danh sách bên trái hoặc ấn nút dưới đây."}
                              {page.status === "converting" && "Đang tách vector chữ viết và sắp đặt layout trang..."}
                            </p>
                            {page.status === "pending" && (
                              <button
                                onClick={() => convertSinglePage(activePdfPageIdx)}
                                className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-sm cursor-pointer"
                              >
                                Bắt đầu nạp trang
                              </button>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div 
                          className="bg-white text-slate-800 border border-slate-200/80 p-[15mm] md:p-[20mm] w-full min-h-[900px] rounded-xl shadow-xs relative select-text"
                          onMouseUp={capturePageSelection}
                          ref={pageRenderContainerRef}
                        >
                          {/* Header standard */}
                          <header className="flex justify-between items-center border-b border-slate-100 pb-2 mb-6 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            <span>Bản ghi phục hồi hệ thống</span>
                            <span>Trang tài liệu {page.pageNumber}</span>
                          </header>

                          {/* MODULAR WYSIWYG TOOLBAR */}
                          <PdfToHtmlWysiwygToolbar 
                            activePdfPageIdx={activePdfPageIdx}
                            rawHtmlText={rawHtmlText}
                            setRawHtmlText={setRawHtmlText}
                            showRawHtml={showRawHtml}
                            setShowRawHtml={setShowRawHtml}
                            updatePdfPageHtml={updatePdfPageHtml}
                            handlePrint={handlePrint}
                            pageRenderContainerRef={pageRenderContainerRef}
                          />

                          {showRawHtml ? (
                            <div className="space-y-2 mt-4 font-sans animate-none">
                              <div className="flex justify-between items-center bg-slate-900 px-4 py-2 rounded-t-xl select-none">
                                <span className="text-[10px] text-slate-300 font-bold font-mono tracking-widest uppercase">Trình biên tập HTML thô</span>
                                <span className="text-[10px] text-slate-400 font-medium">Thay đổi bên dưới sẽ đồng bộ ngay lập tức</span>
                              </div>
                              <textarea
                                value={rawHtmlText}
                                onChange={(e) => {
                                  setRawHtmlText(e.target.value);
                                  updatePdfPageHtml(activePdfPageIdx, e.target.value);
                                }}
                                className="w-full min-h-[620px] font-mono text-xs p-5 bg-neutral-900 text-amber-200 rounded-xl focus:outline-none border border-neutral-800 focus:ring-1 focus:ring-indigo-500 resize-y leading-relaxed shadow-inner"
                              />
                            </div>
                          ) : (
                            /* Editable WYSIWYG canvas */
                            <div 
                              key={activePdfPageIdx}
                              contentEditable={true}
                              suppressContentEditableWarning={true}
                              onBlur={(e) => {
                                updatePdfPageHtml(activePdfPageIdx, e.currentTarget.innerHTML);
                              }}
                              onInput={(e) => {
                                updatePdfPageHtml(activePdfPageIdx, e.currentTarget.innerHTML);
                              }}
                              onPaste={(e) => {
                                const items = e.clipboardData?.items;
                                let hasImage = false;
                                if (items) {
                                  for (let i = 0; i < items.length; i++) {
                                    if (items[i].type.indexOf("image") !== -1) {
                                      e.preventDefault();
                                      hasImage = true;
                                      const file = items[i].getAsFile();
                                      if (file) {
                                        const reader = new FileReader();
                                        reader.onload = (event) => {
                                          const base64 = event.target?.result as string;
                                          const baseImg = `<img src="${base64}" alt="Ảnh dán" style="max-width: 100%; height: auto; border-radius: 0.75rem; margin: 1rem auto; display: block; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);" />`;
                                          
                                          if (pageRenderContainerRef.current) {
                                            const editorDiv = pageRenderContainerRef.current.querySelector(".wysiwyg-editor") as HTMLDivElement;
                                            if (editorDiv) {
                                              editorDiv.focus();
                                              try {
                                                document.execCommand("insertHTML", false, baseImg);
                                              } catch (ex) {
                                                editorDiv.innerHTML += baseImg;
                                              }
                                              updatePdfPageHtml(activePdfPageIdx, editorDiv.innerHTML);
                                            }
                                          }
                                        };
                                        reader.readAsDataURL(file);
                                      }
                                      break;
                                    }
                                  }
                                }
                                if (!hasImage) {
                                  const target = e.currentTarget;
                                  setTimeout(() => {
                                    updatePdfPageHtml(activePdfPageIdx, target.innerHTML);
                                  }, 100);
                                }
                              }}
                              className="wysiwyg-editor w-full prose prose-slate max-w-none text-slate-800 text-xs focus:outline-none min-h-[720px] leading-relaxed p-2 select-text selection:bg-indigo-100 rounded"
                              dangerouslySetInnerHTML={{ __html: page.htmlContent || "" }}
                            />
                          )}

                          {/* Footer standard */}
                          <footer className="absolute bottom-[10mm] inset-x-[15mm] md:inset-x-[20mm] flex justify-between items-center border-t border-slate-105 pt-2 text-[10px] text-slate-400 font-bold">
                            <span>Hệ soạn thảo PDF-First</span>
                            <span>Bảo toàn cấu trúc gốc • Trang {page.pageNumber}</span>
                          </footer>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* AI Image Region Editor Tab (Photoshop-like Layer Selection) */}
                {pdfViewerTab === "image_edit" && (
                  <div className="space-y-4 w-full">
                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-750 flex items-start gap-2 select-none font-medium leading-relaxed">
                      <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>Chế độ Sửa Ảnh AI:</strong> Hãy kéo thả chuột để khoanh vùng (vẽ hình chữ nhật) phần chữ hoặc hình ảnh cần thay thế trực tiếp trên ảnh trang tài liệu dưới đây!
                      </span>
                    </div>

                    {(() => {
                      const page = pdfPages[activePdfPageIdx];
                      if (!page) return null;
                      
                      return (
                        <div className="relative border border-slate-300 rounded-xl overflow-hidden bg-slate-100 shadow-inner flex items-center justify-center select-none" style={{ minHeight: "500px" }}>
                          <div 
                            className="relative cursor-crosshair max-w-full"
                            style={{ userSelect: "none" }}
                            onMouseDown={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const startX = ((e.clientX - rect.left) / rect.width) * 100;
                              const startY = ((e.clientY - rect.top) / rect.height) * 100;
                              
                              // @ts-ignore
                              e.currentTarget._selectionStart = { x: startX, y: startY };
                              if (setImageCropBox) {
                                setImageCropBox({ x: startX, y: startY, w: 0, h: 0 });
                              }
                            }}
                            onMouseMove={(e) => {
                              // @ts-ignore
                              const start = e.currentTarget._selectionStart;
                              if (start && setImageCropBox && imageCropBox) {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const curX = ((e.clientX - rect.left) / rect.width) * 100;
                                const curY = ((e.clientY - rect.top) / rect.height) * 100;
                                
                                const x = Math.min(start.x, curX);
                                const y = Math.min(start.y, curY);
                                const w = Math.abs(start.x - curX);
                                const h = Math.abs(start.y - curY);
                                
                                setImageCropBox({ x, y, w, h });
                              }
                            }}
                            onMouseUp={(e) => {
                              // @ts-ignore
                              e.currentTarget._selectionStart = null;
                              
                              if (imageCropBox && imageCropBox.w > 1 && imageCropBox.h > 1 && setCroppedImageBase64) {
                                const img = e.currentTarget.querySelector("img");
                                if (img) {
                                  const canvas = document.createElement("canvas");
                                  const ctx = canvas.getContext("2d");
                                  if (ctx) {
                                    const natW = img.naturalWidth;
                                    const natH = img.naturalHeight;
                                    
                                    const cropX = (imageCropBox.x / 100) * natW;
                                    const cropY = (imageCropBox.y / 100) * natH;
                                    const cropW = (imageCropBox.w / 100) * natW;
                                    const cropH = (imageCropBox.h / 100) * natH;
                                    
                                    canvas.width = cropW;
                                    canvas.height = cropH;
                                    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
                                    setCroppedImageBase64(canvas.toDataURL("image/jpeg", 0.9));
                                  }
                                }
                              }
                            }}
                          >
                            <img 
                              src={page.imageUrl} 
                              className="max-w-full h-auto pointer-events-none block" 
                              alt="Page selection layer"
                              referrerPolicy="no-referrer"
                            />
                            {/* Bounding box selection overlay */}
                            {imageCropBox && (
                              <div 
                                className="absolute border-2 border-dashed border-indigo-650 bg-indigo-500/15 shadow-[0_0_10px_rgba(99,102,241,0.4)] pointer-events-none"
                                style={{
                                  left: `${imageCropBox.x}%`,
                                  top: `${imageCropBox.y}%`,
                                  width: `${imageCropBox.w}%`,
                                  height: `${imageCropBox.h}%`
                                }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Contrast Compare Panel Side by Side */}
                {pdfViewerTab === "compare" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block text-center bg-slate-200/60 py-1.5 rounded-lg">1. Tài liệu ảnh gốc</span>
                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 p-2 text-center flex items-center justify-center min-h-[400px]">
                        <img src={pdfPages[activePdfPageIdx]?.imageUrl} className="max-w-full h-auto rounded shadow-xs" alt="Page origin" referrerPolicy="no-referrer" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block text-center bg-slate-200/60 py-1.5 rounded-lg">2. Bản dạng văn bản live</span>
                      <div className="border border-slate-250 rounded-xl bg-white p-5 max-h-[450px] overflow-y-auto select-all prose text-xs">
                        {pdfPages[activePdfPageIdx]?.htmlContent ? (
                          <div dangerouslySetInnerHTML={{ __html: pdfPages[activePdfPageIdx].htmlContent || "" }} />
                        ) : (
                          <p className="text-center text-slate-400 py-12">Chưa biên dịch cấu trúc trang này.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Semantic Business XML Structural View */}
                {pdfViewerTab === "xml" && (
                  <div className="space-y-4">
                    <div className="p-4 bg-indigo-50/70 border border-slate-200/80 rounded-xl flex items-start gap-3 select-none leading-relaxed text-xs">
                      <Sparkles className="w-5 h-5 text-indigo-650 flex-shrink-0 animate-pulse mt-0.5" />
                      <div>
                        <strong className="text-slate-805 text-xs block mb-0.5">Mô hình Ngữ Nghĩa XML Nghiệp Vụ (Semantic XML Schema):</strong>
                        <span className="text-slate-600 text-[11px] leading-loose animate-none">
                          Soạn thảo trực quan HTML thể hiện phương diện đồ họa và định dạng. Cấu trúc XML lưu trữ ngữ nghĩa dữ liệu chuẩn hóa bảo đảm khả năng lập chỉ mục, trích xuất thực thể, đồng bộ cơ sở dữ liệu doanh nghiệp, và quản lý nghiệp vụ chuẩn xác 100%.
                        </span>
                      </div>
                    </div>

                    {(() => {
                      const page = pdfPages[activePdfPageIdx];
                      if (!page) return null;
                      if (page.status !== "done") {
                        return (
                          <div className="w-full min-h-[350px] bg-white border border-slate-205 rounded-2xl flex flex-col items-center justify-center text-center p-6 select-none">
                            <Compass className="w-10 h-10 text-slate-300 mb-2" />
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Trang chưa được dịch OCR</h4>
                            <p className="text-xs text-slate-505 mt-1 max-w-xs">
                              Bạn cần đồng dịch dữ liệu trang tài liệu sang dạng hiển thị văn bản trước khi thiết lập cấu trúc XML nghiệp vụ.
                            </p>
                          </div>
                        );
                      }

                      if (!page.xmlContent) {
                        return (
                          <div className="w-full min-h-[350px] bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center text-center p-8 select-none space-y-3.5 animate-none">
                            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 border border-emerald-100">
                              <FileText className="w-6 h-6" />
                            </div>
                            <div className="space-y-1 animate-none">
                              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Chưa khởi dựng XML ngữ nghĩa</h4>
                              <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                                Nhấp chọn nút dưới đây để AI tự động chuyển hóa toàn bộ văn bản và bảng số hành chính của trang thành lược đồ đóng thẻ XML với các thẻ định danh và nhãn nghiệp vụ (VD: &lt;hoaDon&gt;, &lt;tongTien&gt;, &lt;benA&gt;, &lt;hangMuc&gt;...).
                              </p>
                            </div>
                            <button
                              onClick={() => generateSemanticXml(activePdfPageIdx)}
                              disabled={isGeneratingXml}
                              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-lg active:scale-95 transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                            >
                              {isGeneratingXml ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Đang liên kết AI khởi dựng XML...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>Tự động sinh mã XML Ngữ nghĩa</span>
                                </>
                              )}
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-3 font-sans">
                          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 select-none shrink-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Lược đồ XML của trang {page.pageNumber}</span>
                              <span className="text-[9px] bg-emerald-50 text-emerald-650 px-1.5 py-0.5 rounded-full border border-emerald-105 font-bold uppercase">XML Hợp lệ</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => generateSemanticXml(activePdfPageIdx)}
                                disabled={isGeneratingXml}
                                className="px-3 py-1.5 bg-slate-100 border border-slate-200 hover:bg-slate-200 active:bg-slate-300 rounded-lg text-xs font-semibold text-slate-705 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                                title="Đồng bộ dịch lại XML"
                              >
                                {isGeneratingXml ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 text-slate-500" />}
                                <span>AI Dịch lại</span>
                              </button>
                              <button
                                onClick={() => downloadXmlFile(activePdfPageIdx)}
                                className="px-3.5 py-1.5 bg-indigo-650 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg text-xs font-bold text-white transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                                title="Tải xuống tệp .xml"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Tải tệp .xml</span>
                              </button>
                            </div>
                          </div>

                          <div className="border border-slate-250 rounded-xl overflow-hidden bg-slate-950 text-emerald-400 block shadow-inner relative max-h-[580px] overflow-y-auto">
                            {/* Editable editor */}
                            <pre 
                              contentEditable
                              suppressContentEditableWarning
                              onBlur={(e) => {
                                const editedXml = e.currentTarget.textContent || "";
                                setPdfPages(prev => prev.map((p, i) => i === activePdfPageIdx ? { ...p, xmlContent: editedXml } : p));
                              }}
                              className="p-5 font-mono text-xs leading-relaxed overflow-x-auto text-emerald-400 focus:outline-none min-h-[420px] select-text selection:bg-indigo-850 selection:text-white"
                            >
                              {page.xmlContent}
                            </pre>
                            <div className="absolute bottom-2 right-2 bg-slate-900/90 text-[9px] text-slate-500 font-bold uppercase tracking-widest px-2.5 py-1 rounded select-none pointer-events-none border border-slate-800">
                              Trình biên soạn Live XML (Có thể sửa trực tiếp)
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT SIDEBOARD: AI DYNAMIC SELECTION MODIFIER */}
        <PdfToHtmlRightSidebar 
          selectedPdfSelection={selectedPdfSelection}
          pdfSelectionPrompt={pdfSelectionPrompt}
          setPdfSelectionPrompt={setPdfSelectionPrompt}
          pdfSelectionEditing={pdfSelectionEditing}
          isRightSidebarCollapsed={isRightSidebarCollapsed}
          setIsRightSidebarCollapsed={setIsRightSidebarCollapsed}
          applyAISelectionEdit={applyAISelectionEdit}
        />

      </div>
    </div>
  );
}
