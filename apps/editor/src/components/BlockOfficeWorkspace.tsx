import React from "react";
import { AIParsedDocument, DocumentBlock, TableCell, DocumentVersion } from "../types";
import { cn } from "../lib/utils";
import BlockOfficeWordView from "./BlockOfficeWordView";
import BlockOfficeExcelSpreadsheet from "./BlockOfficeExcelSpreadsheet";
import BlockOfficePowerPointSlide from "./BlockOfficePowerPointSlide";
import BlockOfficeSidebar from "./BlockOfficeSidebar";
import BlockOfficeDocChartRenderer from "./BlockOfficeDocChartRenderer";
import { useWordEditor } from "../hooks/useWordEditor";
import { exportDocToXml } from "../lib/blockOfficeXmlExporter";
import BlockOfficeStatusBar from "./BlockOfficeStatusBar";

interface BlockOfficeWorkspaceProps {
  currentDoc: AIParsedDocument;
  setCurrentDoc: React.Dispatch<React.SetStateAction<AIParsedDocument>>;
  activeTab: "word" | "excel" | "powerpoint";
  setActiveTab: React.Dispatch<React.SetStateAction<"word" | "excel" | "powerpoint">>;
  promptInput: string;
  setPromptInput: (val: string) => void;
  refinePrompt: string;
  setRefinePrompt: (val: string) => void;
  isGenerating: boolean;
  isRefining: boolean;
  errorMessage: string | null;
  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;
  activeSlideIdx: number;
  setActiveSlideIdx: React.Dispatch<React.SetStateAction<number>>;
  isFullscreenSlide: boolean;
  setIsFullscreenSlide: (val: boolean) => void;
  handleAIGenerate: (customPrompt?: string) => void;
  handleAIRefine: () => void;
  updateCellValue: (blockId: string, rIdx: number, cIdx: number, value: string, formulaStr?: string) => void;
  evaluateFormula: (formulaStr: string, tableData: TableCell[][]) => string;
  paginateBlocks: (blocks: DocumentBlock[]) => DocumentBlock[][];
  exportToDOCX: () => void;
  exportToXLSX: () => void;
  exportToPPTX: () => void;
  exportToPDF?: () => void;
  handlePrint: () => void;
  handlePDFToBlocksImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  pdfImporting: boolean;
  handleOfficeFileImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  officeImporting: boolean;
  chatMessages: { role: "user" | "assistant"; content: string }[];
  handleChatSendMessage: (text: string) => Promise<void>;
  isSendingChat: boolean;
  handleClearChat: () => void;
  // Version history
  versions: DocumentVersion[];
  onSaveVersion: (label?: string) => void;
  onRestoreVersion: (id: string) => void;
  onDeleteVersion: (id: string) => void;
  // Block state props passed from App
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  moveBlock: (id: string, direction: "up" | "down") => void;
  duplicateBlock: (id: string) => void;
  changeBlockType: (id: string, type: DocumentBlock["type"]) => void;
  deleteBlock: (id: string) => void;
  insertNewBlock: (afterId: string, type: DocumentBlock["type"]) => void;
}

export default function BlockOfficeWorkspace({
  currentDoc,
  setCurrentDoc,
  activeTab,
  setActiveTab,
  promptInput,
  setPromptInput,
  refinePrompt,
  setRefinePrompt,
  isGenerating,
  isRefining,
  errorMessage,
  selectedBlockId,
  setSelectedBlockId,
  activeSlideIdx,
  setActiveSlideIdx,
  isFullscreenSlide,
  setIsFullscreenSlide,
  handleAIGenerate,
  handleAIRefine,
  updateCellValue,
  evaluateFormula,
  paginateBlocks,
  exportToDOCX,
  exportToXLSX,
  exportToPPTX,
  exportToPDF,
  handlePrint,
  handlePDFToBlocksImport,
  pdfImporting,
  handleOfficeFileImport,
  officeImporting,
  chatMessages,
  handleChatSendMessage,
  isSendingChat,
  handleClearChat,
  versions,
  onSaveVersion,
  onRestoreVersion,
  onDeleteVersion,
  canUndo,
  canRedo,
  undo,
  redo,
  moveBlock,
  duplicateBlock,
  changeBlockType,
  deleteBlock,
  insertNewBlock,
}: BlockOfficeWorkspaceProps) {

  const [sidebarMode, setSidebarMode] = React.useState<"manual" | "ai" | "tools" | "chat" | "templates" | "versions">("manual");
  const [wordViewMode, setWordViewMode] = React.useState<"rich" | "blocks">("rich");

  const {
    editorHtml,
    setEditorHtml,
    ribbonTab,
    setRibbonTab,
    isRefiningAi,
    docMargin,
    setDocMargin,
    docLandscape,
    setDocLandscape,
    docTheme,
    setDocTheme,
    showFindReplace,
    setShowFindReplace,
    pendingAiPreviewHtml,
    editorRef,
    isUserEditingRef,
    syncTimeoutRef,
    handleEditorInput,
    handleEditorBlur,
    handleEditorKeyDown,
    executeFormat,
    insertHtmlAtCursor,
    handleAiQuickAction,
    findNext,
    replaceOne,
    replaceAll,
    applyAiPreview,
    rejectAiPreview,
  } = useWordEditor({
    currentDoc,
    setCurrentDoc,
    selectedBlockId,
    setSelectedBlockId,
  });

  React.useEffect(() => {
    if (selectedBlockId) {
      const textareas = document.querySelectorAll(".wp-inline-textarea");
      textareas.forEach(el => {
        const ta = el as HTMLTextAreaElement;
        ta.style.height = "auto";
        ta.style.height = ta.scrollHeight + "px";
      });
    }
  }, [selectedBlockId, currentDoc]);

  const exportToXML = () => {
    exportDocToXml(currentDoc);
  };

  const renderInteractiveChart = (block: DocumentBlock) => (
    <BlockOfficeDocChartRenderer
      block={block}
      currentDoc={currentDoc}
      setCurrentDoc={setCurrentDoc}
      evaluateFormula={evaluateFormula}
    />
  );

  return (
    <div className="flex-grow flex flex-col bg-slate-50/50 h-[calc(100vh-2.5rem)] w-full overflow-hidden">

      {/* MAIN SPLIT CANVAS */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-slate-50/50 h-full w-full">

        {/* PREVIEW CONTAINER SECTION */}
        <section className="lg:col-span-9 bg-slate-100/50 border-r border-slate-200 flex flex-col overflow-hidden h-full">

          {/* CENTRAL CORE SHEET PREVIEW AREA */}
          <div className={cn(
            "flex-grow flex-1 flex min-h-[350px] justify-center select-text",
            activeTab === "word" ? "overflow-hidden h-full p-0" : "overflow-y-auto p-2 lg:p-3"
          )}>

            {/* 1. Word Online Editor */}
            {activeTab === "word" && (
              <BlockOfficeWordView
                currentDoc={currentDoc}
                setCurrentDoc={setCurrentDoc}
                selectedBlockId={selectedBlockId}
                setSelectedBlockId={setSelectedBlockId}
                editorHtml={editorHtml}
                setEditorHtml={setEditorHtml}
                docMargin={docMargin}
                setDocMargin={setDocMargin}
                docLandscape={docLandscape}
                setDocLandscape={setDocLandscape}
                docTheme={docTheme}
                setDocTheme={setDocTheme}
                editorRef={editorRef}
                isUserEditingRef={isUserEditingRef}
                syncTimeoutRef={syncTimeoutRef}
                executeFormat={executeFormat}
                insertHtmlAtCursor={insertHtmlAtCursor}
                handleAiQuickAction={handleAiQuickAction}
                isRefiningAi={isRefiningAi}
                ribbonTab={ribbonTab}
                setRibbonTab={setRibbonTab}
                moveBlock={moveBlock}
                duplicateBlock={duplicateBlock}
                deleteBlock={deleteBlock}
                insertNewBlock={insertNewBlock}
                paginateBlocks={paginateBlocks}
                renderInteractiveChart={renderInteractiveChart}
                evaluateFormula={evaluateFormula}
                wordViewMode={wordViewMode}
                setWordViewMode={setWordViewMode}
                onInput={handleEditorInput}
                onBlur={handleEditorBlur}
                onKeyDown={handleEditorKeyDown}
                showFindReplace={showFindReplace}
                setShowFindReplace={setShowFindReplace}
                findNext={findNext}
                replaceOne={replaceOne}
                replaceAll={replaceAll}
                pendingAiPreviewHtml={pendingAiPreviewHtml}
                applyAiPreview={applyAiPreview}
                rejectAiPreview={rejectAiPreview}
              />
            )}

            {/* 2. Excel Spreadsheet */}
            {activeTab === "excel" && (
              <BlockOfficeExcelSpreadsheet
                currentDoc={currentDoc}
                setCurrentDoc={setCurrentDoc}
                updateCellValue={updateCellValue}
                evaluateFormula={evaluateFormula}
              />
            )}

            {/* 3. PowerPoint Slide */}
            {activeTab === "powerpoint" && (
              <BlockOfficePowerPointSlide
                currentDoc={currentDoc}
                setCurrentDoc={setCurrentDoc}
                activeSlideIdx={activeSlideIdx}
                setActiveSlideIdx={setActiveSlideIdx}
                isFullscreenSlide={isFullscreenSlide}
                setIsFullscreenSlide={setIsFullscreenSlide}
              />
            )}
          </div>
        </section>

        {/* RIGHT SIDEBAR */}
        <BlockOfficeSidebar
          currentDoc={currentDoc}
          setCurrentDoc={setCurrentDoc}
          selectedBlockId={selectedBlockId}
          setSelectedBlockId={setSelectedBlockId}
          sidebarMode={sidebarMode as any}
          setSidebarMode={setSidebarMode as any}
          promptInput={promptInput}
          setPromptInput={setPromptInput}
          refinePrompt={refinePrompt}
          setRefinePrompt={setRefinePrompt}
          isGenerating={isGenerating}
          isRefining={isRefining}
          errorMessage={errorMessage}
          officeImporting={officeImporting}
          pdfImporting={pdfImporting}
          changeBlockType={changeBlockType}
          handleAIGenerate={handleAIGenerate}
          handleAIRefine={handleAIRefine}
          handleOfficeFileImport={handleOfficeFileImport}
          handlePDFToBlocksImport={handlePDFToBlocksImport}
          chatMessages={chatMessages}
          handleChatSendMessage={handleChatSendMessage}
          isSendingChat={isSendingChat}
          handleClearChat={handleClearChat}
          versions={versions}
          onSaveVersion={onSaveVersion}
          onRestoreVersion={onRestoreVersion}
          onDeleteVersion={onDeleteVersion}
          moveBlock={moveBlock}
          duplicateBlock={duplicateBlock}
          deleteBlock={deleteBlock}
          insertNewBlock={insertNewBlock}
        />
      </div>

      <BlockOfficeStatusBar
        currentDoc={currentDoc}
        activeTab={activeTab}
        activeSlideIdx={activeSlideIdx}
      />
    </div>
  );
}
