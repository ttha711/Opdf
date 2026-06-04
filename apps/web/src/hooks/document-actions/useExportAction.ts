import type { Dispatch, SetStateAction } from "react";
import type { useOpdfBridge } from "../useOpdfBridge";

export function useExportAction({
  bridge,
  hasDocument,
  hasDesktopBridge,
  fileName,
  docBytes,
  annotations,
  replaceDocumentBytes,
  setFileName,
  setAnnotations,
  setViewerError,
  setSaveState,
  markDocumentSaved,
}: {
  bridge: ReturnType<typeof useOpdfBridge>;
  hasDocument: boolean;
  hasDesktopBridge: boolean;
  fileName: string;
  docBytes: Uint8Array | null;
  annotations: any[];
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  setFileName: Dispatch<SetStateAction<string>>;
  setAnnotations: Dispatch<SetStateAction<any[]>>;
  setViewerError: Dispatch<SetStateAction<string | null>>;
  setSaveState: Dispatch<SetStateAction<"idle" | "saving" | "saved">>;
  markDocumentSaved: (snapshot?: {
    fileName?: string;
    docBytes?: Uint8Array | null;
    annotations?: any[];
    bookmarks?: Array<{ id: string; page: number; title: string; createdAt: number }>;
    pageRotations?: Record<number, number>;
  }) => void;
}) {
  const commitSavedDocument = (savedBytes: Uint8Array, savedFileName: string) => {
    replaceDocumentBytes(savedBytes);
    setFileName(savedFileName);
    setAnnotations([]);
    markDocumentSaved({
      fileName: savedFileName,
      docBytes: savedBytes,
      annotations: [],
      bookmarks: [],
      pageRotations: {},
    });
  };

  async function savePdf() {
    if (!hasDocument || !fileName || !docBytes) return;
    try {
      setSaveState("saving");
      if (hasDesktopBridge) {
        await bridge.saveDocument(fileName, docBytes);
        if (bridge.replaceAnnotations) {
          await bridge.replaceAnnotations(fileName, annotations);
        }
        markDocumentSaved({
          fileName,
          docBytes,
          annotations,
        });
        setViewerError("File saved successfully!");
        setTimeout(() => setViewerError(null), 3000);
        return;
      }

      if ("showSaveFilePicker" in window) {
        try {
          const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
          const suggestedName = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
          const handle = await (window as any).showSaveFilePicker({
            suggestedName,
            types: [{
              description: "PDF Document",
              accept: { "application/pdf": [".pdf"] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(docBytes);
          await writable.close();
          markDocumentSaved({
            fileName,
            docBytes,
            annotations,
          });
          setViewerError("File saved successfully!");
          setTimeout(() => setViewerError(null), 3000);
          return;
        } catch (err: any) {
          if (err.name === "AbortError") {
            setSaveState("idle");
            return;
          }
          console.error("Save Picker failed, falling back to download", err);
        }
      }

      const blob = new Blob([docBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
      const finalName = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      markDocumentSaved({
        fileName,
        docBytes,
        annotations,
      });
      setViewerError("File saved successfully!");
      setTimeout(() => setViewerError(null), 3000);
    } catch (err) {
      console.error(err);
      setViewerError("Failed to save PDF.");
      setSaveState("idle");
    }
  }

  async function savePdfAs() {
    if (!hasDocument || !fileName || !docBytes) return;
    try {
      setSaveState("saving");
      const flattenedBytes = await bridge.exportFlattened(docBytes, annotations);
      if (hasDesktopBridge) {
        const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
        const suggestedName = baseName.toLowerCase().endsWith(".pdf") ? `edited-${baseName}` : `edited-${baseName}.pdf`;
        const savedPath = await bridge.saveFile(flattenedBytes, suggestedName, ["pdf"]);
        if (!savedPath) {
          setSaveState("idle");
          return;
        }
        commitSavedDocument(flattenedBytes, savedPath);
      } else {
        // Try to use File System Access API for a real "Save As" experience
        if ("showSaveFilePicker" in window) {
          try {
            const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
            const suggestedName = baseName.toLowerCase().endsWith(".pdf") ? `edited-${baseName}` : `edited-${baseName}.pdf`;
            
            const handle = await (window as any).showSaveFilePicker({
              suggestedName,
              types: [{
                description: "PDF Document",
                accept: { "application/pdf": [".pdf"] },
              }],
            });
            const writable = await handle.createWritable();
            await writable.write(flattenedBytes);
            await writable.close();
            commitSavedDocument(flattenedBytes, fileName);
            setViewerError("File saved successfully!");
            setTimeout(() => setViewerError(null), 3000);
            return;
          } catch (err: any) {
            // If user cancels, just return
            if (err.name === "AbortError") {
              setSaveState("idle");
              return;
            }
            console.error("Save Picker failed, falling back to download", err);
          }
        }

        // Fallback for browsers that don't support showSaveFilePicker
        const blob = new Blob([flattenedBytes as unknown as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
        const finalName = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
        a.download = `edited-${finalName}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        commitSavedDocument(flattenedBytes, fileName);
      }
    } catch (err) {
      console.error(err);
      setViewerError("Failed to export PDF.");
      setSaveState("idle");
    }
  }

  return { savePdf, savePdfAs, exportPdf: savePdfAs };
}
