import type React from "react";
import type { MergeFile, SplitPart } from "./types";

interface UseSplitMergeActionsArgs {
  docBytes: Uint8Array | null;
  fileBase: string;
  splitParts: SplitPart[];
  mergeFiles: MergeFile[];
  setMergeFiles: React.Dispatch<React.SetStateAction<MergeFile[]>>;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  setViewerError: (msg: string | null) => void;
  onLoadConvertedPdf: (bytes: Uint8Array, fileName: string) => void;
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function useSplitMergeActions(args: UseSplitMergeActionsArgs) {
  const {
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
  } = args;

  const handleSplitPdf = async () => {
    if (!docBytes || splitParts.length === 0) return;
    setIsProcessing(true);
    setViewerError("Splitting pages...");
    try {
      const pdfLib = await import("pdf-lib");
      const { zipSync } = await import("fflate");
      if (splitParts.length === 1) {
        const source = await pdfLib.PDFDocument.load(docBytes);
        const out = await pdfLib.PDFDocument.create();
        const indices = splitParts[0].pages.map((p) => p - 1).filter((idx) => idx >= 0 && idx < source.getPageCount());
        const copied = await out.copyPages(source, indices);
        copied.forEach((page) => out.addPage(page));
        const bytes = await out.save();
        const blob = new Blob([bytes as any], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = splitParts[0].name;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const source = await pdfLib.PDFDocument.load(docBytes);
        const zipData: Record<string, Uint8Array> = {};
        for (const part of splitParts) {
          const out = await pdfLib.PDFDocument.create();
          const indices = part.pages.map((p) => p - 1).filter((idx) => idx >= 0 && idx < source.getPageCount());
          const copied = await out.copyPages(source, indices);
          copied.forEach((page) => out.addPage(page));
          const bytes = await out.save();
          zipData[part.name] = bytes;
        }
        const zipped = zipSync(zipData);
        const blob = new Blob([zipped as any], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileBase}-split.zip`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setViewerError(null);
    } catch (err) {
      setViewerError("Split failed: " + err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMergeFiles = async (mode: "view" | "download") => {
    if (mergeFiles.length < 2) return;
    setIsProcessing(true);
    setViewerError("Merging documents...");
    try {
      const pdfLib = await import("pdf-lib");
      const merged = await pdfLib.PDFDocument.create();
      for (const file of mergeFiles) {
        const src = await pdfLib.PDFDocument.load(file.bytes);
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      }
      const mergedBytes = await merged.save();
      if (mode === "view") {
        onLoadConvertedPdf(mergedBytes, `${fileBase}-merged.pdf`);
        replaceDocumentBytes(mergedBytes, 1);
      } else {
        const blob = new Blob([mergedBytes as any], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileBase}-merged.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setViewerError(null);
    } catch (err) {
      setViewerError("Merge failed: " + err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMergePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = ".pdf";
      fileInputRef.current.click();
    }
  };

  const handleMergeFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const pdfLib = await import("pdf-lib");
      const entries: MergeFile[] = [];
      for (const file of Array.from(files)) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const pdf = await pdfLib.PDFDocument.load(bytes);
        entries.push({
          id: `${Date.now()}-${Math.random()}`,
          name: file.name,
          bytes,
          totalPages: pdf.getPageCount(),
          size: file.size,
        });
      }
      setMergeFiles((prev) => [...prev, ...entries]);
    } catch (err) {
      setViewerError("Cannot load selected PDF(s): " + err);
    } finally {
      e.target.value = "";
    }
  };

  const moveMergeUp = (idx: number) => {
    if (idx <= 0) return;
    setMergeFiles((prev) => {
      const next = [...prev];
      const temp = next[idx - 1];
      next[idx - 1] = next[idx];
      next[idx] = temp;
      return next;
    });
  };

  const moveMergeDown = (idx: number) => {
    setMergeFiles((prev) => {
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[idx + 1];
      next[idx + 1] = next[idx];
      next[idx] = temp;
      return next;
    });
  };

  const removeMergeFile = (id: string) => {
    setMergeFiles((prev) => prev.filter((item) => item.id !== id));
  };

  return {
    handleSplitPdf,
    handleMergeFiles,
    handleMergePicker,
    handleMergeFileSelected,
    moveMergeUp,
    moveMergeDown,
    removeMergeFile,
  };
}
