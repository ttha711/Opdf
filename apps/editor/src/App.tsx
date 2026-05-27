import React, { Suspense, lazy, useState, useCallback, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import GlobalHeader from "./components/GlobalHeader";
import CommandPalette from "./components/CommandPalette";
import { usePdfToHtml } from "./hooks/usePdfToHtml";
import { useBlockOffice } from "./hooks/useBlockOffice";
import { useToast } from "./hooks/useToast";
import { sanitizeHtml } from "./lib/sanitizer";
import { evaluateFormula } from "./lib/formulaEngine";
import { paginateBlocks } from "./lib/pagination";
import ToastContainer from "./components/ToastContainer";
import { useBlockState } from "./hooks/useBlockState";
import { exportDocToXml } from "./lib/blockOfficeXmlExporter";

const PdfToHtmlWorkspace = lazy(() => import("./components/PdfToHtmlWorkspace"));
const BlockOfficeWorkspace = lazy(() => import("./components/BlockOfficeWorkspace"));

export default function App() {
  const [activeWorkspace, setActiveWorkspace] = useState<"pdf-to-html" | "block-office">("block-office");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // ── Toast Notification System ──────────────────────────
  const { toasts, showToast, dismissToast } = useToast();

  // ── AI Chat States & Handlers ──────────────────────────
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [isSendingChat, setIsSendingChat] = useState(false);

  // ── PDF-to-HTML workspace ──────────────────────────────
  const {
    pdfPages,
    setPdfPages,
    activePdfPageIdx,
    setActivePdfPageIdx,
    pdfFile,
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
    isExporting: isPdfExporting,
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

    // Image Edit states
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
  } = usePdfToHtml(setErrorMessage);

  // ── PostMessage Communication with Opdf ──────────────────
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage("opdf-editor-ready", "*");
    }

    const handleOpdfMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "opdf-load-pdf") {
        const { fileName, docBytes, targetFormat } = event.data;
        if (docBytes) {
          const bytes = docBytes instanceof Uint8Array ? docBytes : new Uint8Array(docBytes);
          setActiveWorkspace("pdf-to-html");
          void loadPdfFromBytes(bytes, fileName || "imported.pdf");

          if (targetFormat) {
            let formatName = targetFormat.toUpperCase();
            let guide = "";
            switch (targetFormat) {
              case "word":
                guide = "Vui lòng chạy OCR chuyển đổi trang, sau đó nhấn nút 'Xuất Word' để tải tệp Word (.docx).";
                break;
              case "excel":
                guide = "Vui lòng chuyển sang tab 'Block Office' để thiết kế bảng biểu hoặc xuất dữ liệu Excel (.xlsx).";
                break;
              case "powerpoint":
                guide = "Vui lòng chuyển sang tab 'Block Office' để dựng slide thuyết trình hoặc xuất PowerPoint (.pptx).";
                break;
              case "rtf":
                guide = "Vui lòng sao chép nội dung HTML đã chuyển đổi hoặc xuất file RTF qua các công cụ trong Block Office.";
                break;
              case "txt":
                guide = "Vui lòng dùng công cụ xem mã code HTML hoặc trích xuất văn bản thô sau khi chuyển đổi xong.";
                break;
              case "xml":
                guide = "Vui lòng dùng tính năng xuất XML trong Block Office sau khi chuyển đổi tài liệu.";
                break;
              case "html":
              default:
                guide = "Tài liệu đã được tải vào Trình biên tập PDF sang Web.";
                break;
            }
            showToast(`📂 Đã nhận tệp PDF để chuyển đổi sang ${formatName}! ${guide}`, "success", 7000);
          }
        }
      }
    };

    window.addEventListener("message", handleOpdfMessage);
    return () => window.removeEventListener("message", handleOpdfMessage);
  }, [loadPdfFromBytes, showToast]);

  // ── BlockOffice workspace ──────────────────────────────
  const {
    activeTab,
    setActiveTab,
    currentDoc,
    setCurrentDoc,
    promptInput,
    setPromptInput,
    refinePrompt,
    setRefinePrompt,
    isGenerating,
    isRefining,
    selectedBlockId,
    setSelectedBlockId,
    activeSlideIdx,
    setActiveSlideIdx,
    isFullscreenSlide,
    setIsFullscreenSlide,
    isExporting: isBlockExporting,
    officeImporting,
    pdfImporting: blockOfficePdfImporting,
    handleAIGenerate,
    handleAIRefine,
    handlePDFToBlocksImport,
    handleOfficeFileImport,
    updateCellValue,
    addNewBlock,
    removeBlock,
    handleDragStart,
    handleDragOver,
    exportToDOCX,
    exportToXLSX,
    exportToPPTX,
    exportToPDF,
    // Version history
    versions,
    handleSaveVersion,
    handleRestoreVersion,
    handleDeleteVersion,
  } = useBlockOffice(setErrorMessage, errorMessage, showToast);

  // ── Block State Hook (Shared) ──────────────────────────
  const {
    canUndo,
    canRedo,
    undo,
    redo,
    moveBlock,
    duplicateBlock,
    changeBlockType,
    deleteBlock,
    insertNewBlock,
  } = useBlockState({ currentDoc, setCurrentDoc, setSelectedBlockId });

  const exportToXML = () => {
    exportDocToXml(currentDoc);
  };

  // ── Print ──────────────────────────────────────────────
  const handlePrint = () => {
    showToast("Đang mở hộp thoại in...", "info");
    setTimeout(() => window.print(), 300);
  };

  // ── Command Palette ────────────────────────────────────
  const commands = useMemo(
    () => [
      { id: "find", label: "Tìm kiếm trong tài liệu", category: "edit" as const, shortcut: "Ctrl+F", action: () => { showToast("Nhấn Ctrl+F trong vùng soạn thảo để tìm kiếm", "info"); } },
      { id: "undo", label: "Hoàn tác", category: "edit" as const, shortcut: "Ctrl+Z", action: () => canUndo && undo() },
      { id: "redo", label: "Làm lại", category: "edit" as const, shortcut: "Ctrl+Y", action: () => canRedo && redo() },
      { id: "ai-rewrite", label: "AI Viết lại đoạn đã chọn", category: "ai" as const, action: () => showToast("Chọn văn bản và dùng AI trong sidebar để viết lại", "info") },
      { id: "ai-summarize", label: "AI Tóm tắt tài liệu", category: "ai" as const, action: () => { handleAIRefine(); showToast("Đang yêu cầu AI tóm tắt...", "info"); } },
      { id: "ai-translate-en", label: "AI Dịch sang tiếng Anh", category: "ai" as const, action: () => showToast("Chọn văn bản và dùng AI > Dịch trong sidebar", "info") },
      { id: "ai-translate-vi", label: "AI Dịch sang tiếng Việt", category: "ai" as const, action: () => showToast("Chọn văn bản và dùng AI > Dịch trong sidebar", "info") },
      { id: "ai-generate", label: "AI Tạo tài liệu mới từ yêu cầu", category: "ai" as const, action: () => { handleAIGenerate(); showToast("Đang tạo tài liệu...", "info"); } },
      { id: "insert-table", label: "Chèn bảng Excel", category: "insert" as const, action: () => { insertNewBlock(selectedBlockId || currentDoc.blocks[0]?.id || "", "table"); showToast("Đã chèn bảng mới", "success"); } },
      { id: "insert-heading", label: "Chèn tiêu đề", category: "insert" as const, action: () => { insertNewBlock(selectedBlockId || currentDoc.blocks[0]?.id || "", "heading"); showToast("Đã chèn tiêu đề mới", "success"); } },
      { id: "insert-paragraph", label: "Chèn đoạn văn", category: "insert" as const, action: () => { insertNewBlock(selectedBlockId || currentDoc.blocks[0]?.id || "", "paragraph"); showToast("Đã chèn đoạn văn mới", "success"); } },
      { id: "insert-callout", label: "Chèn hộp ghi chú", category: "insert" as const, action: () => { insertNewBlock(selectedBlockId || currentDoc.blocks[0]?.id || "", "callout"); showToast("Đã chèn hộp ghi chú", "success"); } },
      { id: "insert-page-break", label: "Chèn ngắt trang", category: "insert" as const, action: () => { insertNewBlock(selectedBlockId || currentDoc.blocks[0]?.id || "", "page-break"); showToast("Đã chèn ngắt trang", "success"); } },
      { id: "insert-slide", label: "Chèn slide thuyết trình", category: "insert" as const, action: () => { insertNewBlock(selectedBlockId || currentDoc.blocks[0]?.id || "", "slide"); showToast("Đã chèn slide mới", "success"); } },
      { id: "export-docx", label: "Xuất Word (.docx)", category: "export" as const, action: () => exportToDOCX() },
      { id: "export-xlsx", label: "Xuất Excel (.xlsx)", category: "export" as const, action: () => exportToXLSX() },
      { id: "export-pptx", label: "Xuất PowerPoint (.pptx)", category: "export" as const, action: () => exportToPPTX() },
      { id: "export-pdf", label: "Xuất PDF", category: "export" as const, action: () => exportToPDF() },
      { id: "export-xml", label: "Xuất XML", category: "export" as const, action: () => exportToXML() },
      { id: "print", label: "In tài liệu", category: "export" as const, shortcut: "Ctrl+P", action: () => handlePrint() },
      { id: "workspace-pdf", label: "Chuyển sang PDF to HTML", category: "navigate" as const, action: () => setActiveWorkspace("pdf-to-html") },
      { id: "workspace-office", label: "Chuyển sang Block Office", category: "navigate" as const, action: () => setActiveWorkspace("block-office") },
    ],
    [canUndo, canRedo, undo, redo, exportToDOCX, exportToXLSX, exportToPPTX, exportToPDF, exportToXML, handlePrint, handleAIGenerate, handleAIRefine, insertNewBlock, setActiveWorkspace, showToast]
  );

  // ── Global Keyboard Shortcuts ─────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── AI Chat ────────────────────────────────────────────
  const handleChatSendMessage = async (text: string) => {
    if (!text.trim() || isSendingChat) return;

    const userMessage = { role: "user" as const, content: text };
    const newMessages = [...chatMessages, userMessage];
    setChatMessages(prev => [...prev, userMessage]);
    setIsSendingChat(true);

    try {
      const docText = currentDoc.blocks
        .map(b => (b.content ? b.content.replace(/<[^>]*>/g, " ").trim() : ""))
        .filter(t => t.length > 0)
        .join("\n\n");

      const response = await fetch("/api/chat-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentText: docText, messages: newMessages }),
      });

      if (!response.ok) throw new Error("chat-doc request failed");
      const data = await response.json();

      if (data.answer) {
        setChatMessages(prev => [
          ...prev,
          { role: "assistant" as const, content: data.answer },
        ]);
      } else {
        setChatMessages(prev => [
          ...prev,
          { role: "assistant" as const, content: "Mình chưa nhận được nội dung trả lời. Bạn thử lại giúp mình." },
        ]);
      }
    } catch (err) {
      setErrorMessage("Không thể kết nối đến Trợ lý AI. Vui lòng thử lại.");
      setChatMessages(prev => [
        ...prev,
        { role: "assistant" as const, content: "Hiện chưa kết nối được trợ lý AI. Vui lòng thử lại sau ít phút." },
      ]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleClearChat = () => {
    setChatMessages([]);
  };

  const activeExportType = isPdfExporting || isBlockExporting || null;

  // Preload opposite workspace in background
  React.useEffect(() => {
    let cancelled = false;
    const preload = () => {
      if (cancelled) return;
      if (activeWorkspace === "pdf-to-html") {
        void import("./components/BlockOfficeWorkspace");
      } else {
        void import("./components/PdfToHtmlWorkspace");
      }
    };

    const idleApi = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    let idleId: number | null = null;
    if (idleApi.requestIdleCallback) {
      idleId = idleApi.requestIdleCallback(preload, { timeout: 1500 });
    } else {
      idleId = window.setTimeout(preload, 700);
    }

    return () => {
      cancelled = true;
      if (idleId === null) return;
      if (idleApi.cancelIdleCallback && idleApi.requestIdleCallback) {
        idleApi.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [activeWorkspace]);

  // Show errorMessage as toast
  React.useEffect(() => {
    if (errorMessage) {
      showToast(`❌ ${errorMessage}`, "error");
    }
  }, [errorMessage]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 flex flex-col text-slate-800 font-sans cursor-default select-none antialiased">

      {/* ── Global Export Spinner ── */}
      <AnimatePresence>
        {activeExportType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4"
          >
            <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-xl flex flex-col items-center max-w-sm text-center">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
              <h3 className="text-base font-bold text-slate-800 capitalize">
                Đang đóng gói tệp {activeExportType}
              </h3>
              <p className="text-xs text-slate-400 mt-2">
                Đang xuất tệp chất lượng cao, vui lòng chờ...
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Global Header ── */}
      <GlobalHeader
        activeWorkspace={activeWorkspace}
        setActiveWorkspace={setActiveWorkspace}
        pdfViewerTab={pdfViewerTab as any}
        setPdfViewerTab={setPdfViewerTab as any}
        pdfPages={pdfPages}
        exportPDFToWord={exportPDFToWord}
        handlePrint={handlePrint}
        setSelectedPdfSelection={setSelectedPdfSelection}
        // BlockOffice Workspace Props
        activeTab={activeTab === "word" || activeTab === "excel" || activeTab === "powerpoint" ? activeTab : "word"}
        setActiveTab={setActiveTab as any}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        exportToDOCX={exportToDOCX}
        exportToXLSX={exportToXLSX}
        exportToPPTX={exportToPPTX}
        exportToXML={exportToXML}
        exportToPDF={exportToPDF}
      />

      {/* ── Workspace ── */}
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="flex items-center gap-2 text-slate-600 text-sm font-semibold">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading workspace...</span>
            </div>
          </div>
        }
      >
        {activeWorkspace === "pdf-to-html" ? (
          <PdfToHtmlWorkspace
            pdfPages={pdfPages}
            setPdfPages={setPdfPages}
            activePdfPageIdx={activePdfPageIdx}
            setActivePdfPageIdx={setActivePdfPageIdx}
            pdfFile={pdfFile}
            pdfImporting={pdfImporting}
            pdfProgress={pdfProgress}
            selectedPdfSelection={selectedPdfSelection}
            setSelectedPdfSelection={setSelectedPdfSelection}
            pdfSelectionPrompt={pdfSelectionPrompt}
            setPdfSelectionPrompt={setPdfSelectionPrompt}
            pdfSelectionEditing={pdfSelectionEditing}
            pdfTranslateState={pdfTranslateState}
            pdfViewerTab={pdfViewerTab as any}
            setPdfViewerTab={(tab) => setPdfViewerTab(tab as any)}
            handlePDFUpload={handlePDFUpload}
            convertSinglePage={convertSinglePage}
            convertAllPages={convertAllPages}
            stopAllPages={stopAllPages}
            cancelAllPages={cancelAllPages}
            capturePageSelection={capturePageSelection}
            applyAISelectionEdit={applyAISelectionEdit}
            exportPDFToWord={exportPDFToWord}
            handlePrint={handlePrint}
            pageRenderContainerRef={pageRenderContainerRef}
            handleClosePDF={handleClosePDF}
            imageEditMode={imageEditMode}
            setImageEditMode={setImageEditMode}
            imageCropBox={imageCropBox}
            setImageCropBox={setImageCropBox}
            croppedImageBase64={croppedImageBase64}
            setCroppedImageBase64={setCroppedImageBase64}
            imageEditPrompt={imageEditPrompt}
            setImageEditPrompt={setImageEditPrompt}
            isImageEditing={isImageEditing}
            applyImageRegionEdit={applyImageRegionEdit}
            updatePdfPageHtml={(idx, html) => {
              const clean = sanitizeHtml(html);
              setPdfPages(prev =>
                prev.map((p, i) => (i === idx ? { ...p, htmlContent: clean } : p))
              );
            }}
          />
        ) : (
          <BlockOfficeWorkspace
            currentDoc={currentDoc}
            setCurrentDoc={setCurrentDoc}
            activeTab={activeTab === "word" || activeTab === "excel" || activeTab === "powerpoint" ? activeTab : "word"}
            setActiveTab={(tab) => setActiveTab(tab as any)}
            promptInput={promptInput}
            setPromptInput={setPromptInput}
            refinePrompt={refinePrompt}
            setRefinePrompt={setRefinePrompt}
            isGenerating={isGenerating}
            isRefining={isRefining}
            errorMessage={errorMessage}
            selectedBlockId={selectedBlockId}
            setSelectedBlockId={setSelectedBlockId}
            activeSlideIdx={activeSlideIdx}
            setActiveSlideIdx={setActiveSlideIdx}
            isFullscreenSlide={isFullscreenSlide}
            setIsFullscreenSlide={setIsFullscreenSlide}
            handleAIGenerate={handleAIGenerate}
            handleAIRefine={handleAIRefine}
            updateCellValue={updateCellValue}
            evaluateFormula={evaluateFormula}
            paginateBlocks={paginateBlocks}
            exportToDOCX={exportToDOCX}
            exportToXLSX={exportToXLSX}
            exportToPPTX={exportToPPTX}
            exportToPDF={exportToPDF}
            handlePrint={handlePrint}
            handlePDFToBlocksImport={handlePDFToBlocksImport}
            pdfImporting={blockOfficePdfImporting}
            handleOfficeFileImport={handleOfficeFileImport}
            officeImporting={officeImporting}
            chatMessages={chatMessages}
            handleChatSendMessage={handleChatSendMessage}
            isSendingChat={isSendingChat}
            handleClearChat={handleClearChat}
            // Version history
            versions={versions}
            onSaveVersion={handleSaveVersion}
            onRestoreVersion={handleRestoreVersion}
            onDeleteVersion={handleDeleteVersion}
            // Block State props
            canUndo={canUndo}
            canRedo={canRedo}
            undo={undo}
            redo={redo}
            moveBlock={moveBlock}
            duplicateBlock={duplicateBlock}
            changeBlockType={changeBlockType}
            deleteBlock={deleteBlock}
            insertNewBlock={insertNewBlock}
          />
        )}
      </Suspense>

      {/* ── Command Palette ── */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        commands={commands}
      />

      {/* ── Toast Notifications ── */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
