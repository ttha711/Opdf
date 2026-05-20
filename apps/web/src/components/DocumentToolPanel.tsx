import { useEffect, useMemo, useRef, useState } from "react";
import { SplitToolPanel } from "./document-tool-panel/SplitToolPanel";
import { MergeToolPanel } from "./document-tool-panel/MergeToolPanel";
import { PdfToImagePanel, PdfToOfficePanel, OfficeToPdfPanel, CompressPanel, WatermarkPanel, FillFormPanel } from "./document-tool-panel/uiPanels";
import { buildSplitParts } from "./document-tool-panel/splitParts";
import { getDocumentToolName } from "./document-tool-panel/toolNames";
import type { DocumentToolPanelProps, MergeFile } from "./document-tool-panel/types";
import { useSplitMergeActions } from "./document-tool-panel/useSplitMergeActions";
import { useConversionActions } from "./document-tool-panel/useConversionActions";

export function DocumentToolPanel({
  activeToolId,
  fileName,
  docBytes,
  totalPages,
  thumbnails,
  annotations,
  onClose,
  onLoadConvertedPdf,
  onOpenHtmlEditor,
  setViewerError,
  replaceDocumentBytes,
  bridge,
}: DocumentToolPanelProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [imgFormat, setImgFormat] = useState<"png" | "jpg">("png");
  const [imgQuality, setImgQuality] = useState("Keep original DPI");
  const [imgOutputOption, setImgOutputOption] = useState<"one-per-page" | "all-in-one">("one-per-page");
  const [imgZoom, setImgZoom] = useState(100);
  const [imgColorMode, setImgColorMode] = useState<"color" | "grayscale">("color");
  const [imgIncludeComments, setImgIncludeComments] = useState(true);

  const [officeLayout, setOfficeLayout] = useState<"flow" | "exact">("flow");
  const [officeOcrLang, setOfficeOcrLang] = useState("None");

  const [officePageSize, setOfficePageSize] = useState<"A4" | "Letter">("A4");
  const [officeOrientation, setOfficeOrientation] = useState<"auto" | "portrait" | "landscape">("auto");
  const [officeMargins, setOfficeMargins] = useState<"none" | "normal" | "custom">("normal");

  const [compressLevel, setCompressLevel] = useState<"high" | "medium" | "low">("medium");
  const [compressOptimizeImages, setCompressOptimizeImages] = useState(true);

  const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
  const [watermarkFontSize, setWatermarkFontSize] = useState(48);
  const [watermarkColor, setWatermarkColor] = useState("#ff0000");
  const [watermarkOpacity, setWatermarkOpacity] = useState(30);
  const [watermarkRotation, setWatermarkRotation] = useState(-45);

  const [splitMode, setSplitMode] = useState<"all" | "range" | "extract">("range");
  const [splitRangeInput, setSplitRangeInput] = useState("");
  const [splitExtractInput, setSplitExtractInput] = useState("");
  const [mergeFiles, setMergeFiles] = useState<MergeFile[]>([]);

  useEffect(() => {
    if (totalPages > 1) {
      setSplitRangeInput(`1-${Math.ceil(totalPages / 2)}, ${Math.ceil(totalPages / 2) + 1}-${totalPages}`);
      setSplitExtractInput(`1, ${Math.min(3, totalPages)}, ${Math.min(5, totalPages)}-${totalPages}`);
    } else {
      setSplitRangeInput("1");
      setSplitExtractInput("1");
    }
  }, [totalPages, activeToolId]);

  useEffect(() => {
    if (activeToolId === "merge-pdf" && docBytes) {
      setMergeFiles([{ id: "active-doc", name: fileName || "document.pdf", bytes: docBytes, totalPages, size: docBytes.length }]);
    }
  }, [activeToolId, docBytes, fileName, totalPages]);

  const fileBase = useMemo(() => {
    const base = fileName.split(/[/\\]/).pop() || "document.pdf";
    return base.toLowerCase().endsWith(".pdf") ? base.slice(0, -4) : base;
  }, [fileName]);

  const splitParts = useMemo(
    () => buildSplitParts(splitMode, splitRangeInput, splitExtractInput, totalPages, fileBase),
    [splitMode, splitRangeInput, splitExtractInput, totalPages, fileBase]
  );

  const toolName = useMemo(() => getDocumentToolName(activeToolId), [activeToolId]);

  const {
    handlePdfToImages,
    handlePdfToOffice,
    handleOfficeToPdf,
    handleOfficeFileSelected,
    handleCompressPdf,
    handleAddWatermark,
  } = useConversionActions({
    activeToolId,
    fileName,
    fileBase,
    docBytes,
    thumbnails,
    bridge,
    onLoadConvertedPdf,
    onOpenHtmlEditor,
    replaceDocumentBytes,
    setViewerError,
    setIsProcessing,
    fileInputRef,
    imgFormat,
    imgOutputOption,
    imgZoom,
    imgColorMode,
    officeLayout,
    officeOcrLang,
    officePageSize,
    officeOrientation,
    officeMargins,
    compressLevel,
    watermarkText,
    watermarkFontSize,
    watermarkColor,
    watermarkOpacity,
    watermarkRotation,
  });

  const {
    handleSplitPdf,
    handleMergeFiles,
    handleMergePicker,
    handleMergeFileSelected,
    moveMergeUp,
    moveMergeDown,
    removeMergeFile,
  } = useSplitMergeActions({
    docBytes,
    fileBase,
    splitParts,
    mergeFiles,
    setMergeFiles,
    setIsProcessing,
    setViewerError,
    onLoadConvertedPdf,
    replaceDocumentBytes,
    fileInputRef,
  });

  return (
    <aside className="acrobat-tool-panel select-none overflow-y-auto border-l border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-primary)]">
      <input
        type="file"
        ref={fileInputRef}
        onChange={activeToolId === "merge-pdf" ? handleMergeFileSelected : handleOfficeFileSelected}
        multiple={activeToolId === "merge-pdf"}
        className="hidden"
      />

      <div className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-4 py-3">
        <h4 className="m-0 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.04em] text-[var(--text-primary)]">
          <span className="text-[14px]">⚙️</span> {toolName}
        </h4>
        <button onClick={onClose} className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[11px] text-[var(--text-secondary)] hover:bg-[var(--ui-hover-bg)] hover:text-[var(--text-primary)] transition-all">
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {activeToolId.startsWith("pdf-to") || ["compress-pdf", "split-pdf", "watermark-pdf"].includes(activeToolId) ? (
          <div className="rounded-lg bg-[var(--ui-muted-bg)] p-2.5 border border-dashed border-[var(--border-color)] text-xs">
            <span className="font-semibold block text-[var(--text-secondary)] uppercase text-[10px] tracking-wide mb-1">Source File</span>
            <span className="truncate block font-semibold" title={fileName}>{fileName || "No document loaded"}</span>
            <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">Total: {totalPages} pages</span>
          </div>
        ) : null}

        {(activeToolId === "pdf-to-png" || activeToolId === "pdf-to-jpeg") && (
          <PdfToImagePanel
            imgFormat={imgFormat}
            setImgFormat={setImgFormat}
            imgQuality={imgQuality}
            setImgQuality={setImgQuality}
            imgOutputOption={imgOutputOption}
            setImgOutputOption={setImgOutputOption}
            imgZoom={imgZoom}
            setImgZoom={setImgZoom}
            imgColorMode={imgColorMode}
            setImgColorMode={setImgColorMode}
            imgIncludeComments={imgIncludeComments}
            setImgIncludeComments={setImgIncludeComments}
            isProcessing={isProcessing}
            onConvert={handlePdfToImages}
          />
        )}

        {activeToolId.startsWith("pdf-to") && activeToolId !== "pdf-to-png" && activeToolId !== "pdf-to-jpeg" && (
          <PdfToOfficePanel
            officeLayout={officeLayout}
            setOfficeLayout={setOfficeLayout}
            officeOcrLang={officeOcrLang}
            setOfficeOcrLang={setOfficeOcrLang}
            isProcessing={isProcessing}
            onExport={handlePdfToOffice}
          />
        )}

        {activeToolId.endsWith("-to-pdf") && (
          <OfficeToPdfPanel
            officePageSize={officePageSize}
            setOfficePageSize={setOfficePageSize}
            officeOrientation={officeOrientation}
            setOfficeOrientation={setOfficeOrientation}
            officeMargins={officeMargins}
            setOfficeMargins={setOfficeMargins}
            isProcessing={isProcessing}
            onSelectAndConvert={handleOfficeToPdf}
          />
        )}

        {activeToolId === "compress-pdf" && (
          <CompressPanel
            compressLevel={compressLevel}
            setCompressLevel={setCompressLevel}
            compressOptimizeImages={compressOptimizeImages}
            setCompressOptimizeImages={setCompressOptimizeImages}
            isProcessing={isProcessing}
            hasDoc={!!docBytes}
            onCompress={handleCompressPdf}
          />
        )}

        {activeToolId === "watermark-pdf" && (
          <WatermarkPanel
            watermarkText={watermarkText}
            setWatermarkText={setWatermarkText}
            watermarkFontSize={watermarkFontSize}
            setWatermarkFontSize={setWatermarkFontSize}
            watermarkColor={watermarkColor}
            setWatermarkColor={setWatermarkColor}
            watermarkOpacity={watermarkOpacity}
            setWatermarkOpacity={setWatermarkOpacity}
            watermarkRotation={watermarkRotation}
            setWatermarkRotation={setWatermarkRotation}
            isProcessing={isProcessing}
            hasDoc={!!docBytes}
            onApply={handleAddWatermark}
          />
        )}

        {activeToolId === "split-pdf" && (
          <SplitToolPanel
            splitMode={splitMode}
            setSplitMode={setSplitMode}
            splitRangeInput={splitRangeInput}
            setSplitRangeInput={setSplitRangeInput}
            splitExtractInput={splitExtractInput}
            setSplitExtractInput={setSplitExtractInput}
            splitParts={splitParts}
            isProcessing={isProcessing}
            onSplit={handleSplitPdf}
          />
        )}

        {activeToolId === "merge-pdf" && (
          <MergeToolPanel
            mergeFiles={mergeFiles}
            isProcessing={isProcessing}
            onPick={handleMergePicker}
            onMoveUp={moveMergeUp}
            onMoveDown={moveMergeDown}
            onRemove={removeMergeFile}
            onMerge={handleMergeFiles}
          />
        )}

        {activeToolId === "fill-form" && <FillFormPanel />}
      </div>

      <div className="absolute bottom-6 left-4 right-4 p-2.5 rounded bg-[var(--ui-muted-bg)] border border-[var(--border-color)] text-[10px] text-[var(--text-secondary)] leading-normal flex gap-2 items-start">
        <span className="text-[12px] relative top-px">🔒</span>
        <span>Processed 100% locally client-side. Complete file security.</span>
      </div>
    </aside>
  );
}
