import React from "react";
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { PageResult } from "../types";

import PdfToHtmlLeftSidebar from "./PdfToHtmlLeftSidebar";
import PdfToHtmlRightSidebar from "./PdfToHtmlRightSidebar";
import PdfToHtmlMidPanel from "./PdfToHtmlMidPanel";
import { usePageManipulation } from "../hooks/usePageManipulation";
import { useFileAppend } from "../hooks/useFileAppend";
import { useXmlGeneration } from "../hooks/useXmlGeneration";

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
  applyAISelectionTranslate: () => void;
  exportPDFToWord: () => void;
  handlePrint: () => void;
  pageRenderContainerRef: React.RefObject<HTMLDivElement | null>;
  handleClosePDF: () => void;
  updatePdfPageHtml: (idx: number, htmlContent: string) => void;
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
  translateToVietnamese?: boolean;
  setTranslateToVietnamese?: (val: boolean) => void;
  useTailwindLayout?: boolean;
  setUseTailwindLayout?: (val: boolean) => void;
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
  applyAISelectionTranslate,
  exportPDFToWord,
  handlePrint,
  pageRenderContainerRef,
  handleClosePDF,
  updatePdfPageHtml,
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
  translateToVietnamese,
  setTranslateToVietnamese,
  useTailwindLayout,
  setUseTailwindLayout,
}: PdfToHtmlWorkspaceProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] =
    React.useState(false);
  const [showRawHtml, setShowRawHtml] = React.useState(false);
  const [rawHtmlText, setRawHtmlText] = React.useState("");

  React.useEffect(() => {
    const page = pdfPages[activePdfPageIdx];
    if (page && page.htmlContent) {
      setRawHtmlText(page.htmlContent);
    }
  }, [activePdfPageIdx, pdfPages]);

  const { handleAddEmptyPage, handleClonePage, handleDeletePage, handleMovePage } =
    usePageManipulation({
      pdfPages,
      setPdfPages,
      activePdfPageIdx,
      setActivePdfPageIdx,
    });

  const { isAppendingFiles, appendProgress, handleAppendIncomingFiles } =
    useFileAppend({ pdfPages, setPdfPages, setActivePdfPageIdx });

  const { isGeneratingXml, generateSemanticXml, downloadXmlFile } =
    useXmlGeneration({ pdfPages, setPdfPages });

  React.useEffect(() => {
    if (selectedPdfSelection && selectedPdfSelection.range) {
      const sel = window.getSelection();
      if (sel) {
        try {
          if (sel.rangeCount === 0 || sel.toString() !== selectedPdfSelection.text) {
            sel.removeAllRanges();
            sel.addRange(selectedPdfSelection.range);
          }
        } catch (e) {
          console.warn("Failed to restore selection range:", e);
        }
      }
    }
  }, [selectedPdfSelection]);

  return (
    <>
      {/* Screen Editor Workspace (hidden when printing) */}
      <div className="flex flex-col flex-grow overflow-hidden bg-slate-50/50 h-[calc(100vh-3.5rem)] w-full select-none print:hidden">
        <div className="flex-grow flex flex-col lg:flex-row overflow-hidden w-full h-full">
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
            translateToVietnamese={translateToVietnamese}
            setTranslateToVietnamese={setTranslateToVietnamese}
            useTailwindLayout={useTailwindLayout}
            setUseTailwindLayout={setUseTailwindLayout}
          />

          <PdfToHtmlMidPanel
            pdfPages={pdfPages}
            setPdfPages={setPdfPages}
            activePdfPageIdx={activePdfPageIdx}
            showRawHtml={showRawHtml}
            setShowRawHtml={setShowRawHtml}
            rawHtmlText={rawHtmlText}
            setRawHtmlText={setRawHtmlText}
            pdfViewerTab={pdfViewerTab}
            convertSinglePage={convertSinglePage}
            capturePageSelection={capturePageSelection}
            updatePdfPageHtml={updatePdfPageHtml}
            handlePrint={handlePrint}
            pageRenderContainerRef={pageRenderContainerRef}
            imageCropBox={imageCropBox}
            setImageCropBox={setImageCropBox}
            setCroppedImageBase64={setCroppedImageBase64}
            isGeneratingXml={isGeneratingXml}
            generateSemanticXml={generateSemanticXml}
            downloadXmlFile={downloadXmlFile}
          />

          <PdfToHtmlRightSidebar
            selectedPdfSelection={selectedPdfSelection}
            pdfSelectionPrompt={pdfSelectionPrompt}
            setPdfSelectionPrompt={setPdfSelectionPrompt}
            pdfSelectionEditing={pdfSelectionEditing}
            isRightSidebarCollapsed={isRightSidebarCollapsed}
            setIsRightSidebarCollapsed={setIsRightSidebarCollapsed}
            applyAISelectionEdit={applyAISelectionEdit}
            applyAISelectionTranslate={applyAISelectionTranslate}
          />
        </div>
      </div>

      {/* Print-Only Document Container (prints all pages sequentially) */}
      <div className="hidden print:block w-full h-auto bg-white select-text font-sans">
        {pdfPages.map((page) => (
          <div
            key={page.pageNumber}
            className="a4-page-print bg-white mx-auto print:p-0 print:m-0"
            style={{ pageBreakAfter: "always" }}
          >
            {page.status === "done" && page.htmlContent ? (
              <div
                className={page.htmlContent.includes("slide-container")
                  ? "w-full h-auto select-text selection:bg-indigo-100 bg-white"
                  : "prose prose-slate max-w-none text-slate-800 text-xs leading-relaxed p-[20mm] bg-white print:p-[20mm] selection:bg-indigo-100"}
                dangerouslySetInnerHTML={{ __html: page.htmlContent }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white p-0">
                <img
                  src={page.imageUrl}
                  className="w-full h-auto max-h-full object-contain bg-white"
                  alt={`Trang ${page.pageNumber}`}
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
