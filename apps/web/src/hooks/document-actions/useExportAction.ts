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
  setDocBytes,
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
  setDocBytes: Dispatch<SetStateAction<Uint8Array | null>>;
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
  // Silent update — replaces bytes in state without triggering viewer re-render (no transitionTick bump).
  // Used by Save so the page doesn't blink after a save.
  const silentSave = (savedBytes: Uint8Array, savedFileName: string) => {
    setDocBytes(savedBytes);
    setFileName(savedFileName);
    setAnnotations([]);
    // Omit bookmarks/pageRotations so markDocumentSaved uses the current closure values —
    // this ensures the fingerprint matches what the useEffect will compute.
    markDocumentSaved({ fileName: savedFileName, docBytes: savedBytes, annotations: [] });
    setSaveState("saved");
  };

  // Full replace — used by Save As (user is switching to the exported version).
  const commitSavedDocument = (savedBytes: Uint8Array, savedFileName: string) => {
    replaceDocumentBytes(savedBytes);
    setFileName(savedFileName);
    setAnnotations([]);
    markDocumentSaved({ fileName: savedFileName, docBytes: savedBytes, annotations: [] });
    setSaveState("saved");
  };

  // ── Save (Ctrl+S) ──────────────────────────────────────────────────────────
  // Web: flattens + downloads with current filename, no file-picker dialog.
  // Desktop: writes to existing path, keeps annotations in bridge.
  async function savePdf() {
    if (!hasDocument || !fileName || !docBytes) return;
    try {
      setSaveState("saving");

      if (hasDesktopBridge) {
        await bridge.saveDocument(fileName, docBytes);
        if (bridge.replaceAnnotations) {
          await bridge.replaceAnnotations(fileName, annotations);
        }
        markDocumentSaved({ fileName, docBytes, annotations });
        setSaveState("saved");
        setViewerError("File saved successfully!");
        setTimeout(() => setViewerError(null), 3000);
        return;
      }

      const bytesToSave = annotations.length > 0
        ? await bridge.exportFlattened(docBytes, annotations)
        : docBytes;

      const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
      const finalName = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;

      const blob = new Blob([bytesToSave as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      silentSave(bytesToSave, fileName);
      setViewerError("File saved successfully!");
      setTimeout(() => setViewerError(null), 3000);
    } catch (err) {
      console.error(err);
      setViewerError("Failed to save PDF.");
      setSaveState("idle");
    }
  }

  // ── Save As (Ctrl+Shift+S) ─────────────────────────────────────────────────
  // Web: flattens + prompts with file-picker for a new name/location.
  // Desktop: opens native save-file dialog.
  async function savePdfAs() {
    if (!hasDocument || !fileName || !docBytes) return;
    try {
      setSaveState("saving");
      const flattenedBytes = await bridge.exportFlattened(docBytes, annotations);

      if (hasDesktopBridge) {
        const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
        const suggestedName = baseName.toLowerCase().endsWith(".pdf") ? `edited-${baseName}` : `edited-${baseName}.pdf`;
        const savedPath = await bridge.saveFile(flattenedBytes, suggestedName, ["pdf"]);
        if (!savedPath) { setSaveState("idle"); return; }
        commitSavedDocument(flattenedBytes, savedPath);
        return;
      }

      if ("showSaveFilePicker" in window) {
        try {
          const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
          const suggestedName = baseName.toLowerCase().endsWith(".pdf") ? `edited-${baseName}` : `edited-${baseName}.pdf`;
          const handle = await (window as any).showSaveFilePicker({
            suggestedName,
            types: [{ description: "PDF Document", accept: { "application/pdf": [".pdf"] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(flattenedBytes);
          await writable.close();
          commitSavedDocument(flattenedBytes, handle.name ?? fileName);
          setViewerError("File saved successfully!");
          setTimeout(() => setViewerError(null), 3000);
          return;
        } catch (err: any) {
          if (err.name === "AbortError") { setSaveState("idle"); return; }
          console.error("Save Picker failed, falling back to download", err);
        }
      }

      // Fallback: download with edited- prefix
      const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
      const finalName = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
      const blob = new Blob([flattenedBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `edited-${finalName}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      commitSavedDocument(flattenedBytes, fileName);
    } catch (err) {
      console.error(err);
      setViewerError("Failed to export PDF.");
      setSaveState("idle");
    }
  }

  return { savePdf, savePdfAs, exportPdf: savePdfAs };
}
