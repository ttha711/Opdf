import type { Dispatch, SetStateAction } from "react";
import type { useOpdfBridge } from "../useOpdfBridge";
import { savePdfBytes, saveWebState, computeFileHash, saveAnnotationsByHash } from "../../lib/web-storage";

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
  // ── Save (Ctrl+S) ──────────────────────────────────────────────────────────
  // Desktop: writes docBytes to existing path + saves annotations. No flatten.
  // Web: saves docBytes + annotations to IndexedDB draft. No download, no flatten.
  async function savePdf() {
    if (!hasDocument || !fileName || !docBytes) return;
    try {
      setSaveState("saving");

      // Persist annotations keyed by file hash — works for both web and desktop restarts.
      const hash = await computeFileHash(docBytes);
      await saveAnnotationsByHash(hash, annotations);

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

      // Web: persist draft to IndexedDB so the session can be resumed.
      await savePdfBytes(docBytes);
      await saveWebState({ fileName, annotations, thumbnails: [], page: 1 });
      markDocumentSaved({ fileName, docBytes, annotations });
      setSaveState("saved");
      setViewerError("File saved successfully!");
      setTimeout(() => setViewerError(null), 3000);
    } catch (err) {
      console.error(err);
      setViewerError("Failed to save PDF.");
      setSaveState("idle");
    }
  }

  // ── Save As (Ctrl+Shift+S) ─────────────────────────────────────────────────
  // Lets the user pick a new location/name. Saves raw docBytes (no flatten).
  // Annotations are kept in state so editing continues on the new file.
  async function savePdfAs() {
    if (!hasDocument || !fileName || !docBytes) return;
    try {
      setSaveState("saving");

      if (hasDesktopBridge) {
        const savedPath = await bridge.saveDocumentAs(docBytes);
        if (!savedPath) { setSaveState("idle"); return; }
        if (bridge.replaceAnnotations) {
          await bridge.replaceAnnotations(savedPath, annotations);
        }
        setDocBytes(docBytes);
        setFileName(savedPath);
        markDocumentSaved({ fileName: savedPath, docBytes, annotations });
        setSaveState("saved");
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
            types: [{ description: "PDF Document", accept: { "application/pdf": [".pdf"] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(docBytes);
          await writable.close();
          const newName = handle.name ?? fileName;
          setFileName(newName);
          markDocumentSaved({ fileName: newName, docBytes, annotations });
          setSaveState("saved");
          setViewerError("File saved successfully!");
          setTimeout(() => setViewerError(null), 3000);
          return;
        } catch (err: any) {
          if (err.name === "AbortError") { setSaveState("idle"); return; }
          console.error("Save Picker failed, falling back to download", err);
        }
      }

      // Fallback: download raw (non-flattened) bytes with current filename.
      const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
      const finalName = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
      const blob = new Blob([docBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      markDocumentSaved({ fileName, docBytes, annotations });
      setSaveState("saved");
    } catch (err) {
      console.error(err);
      setViewerError("Failed to save PDF.");
      setSaveState("idle");
    }
  }

  // ── Export PDF ─────────────────────────────────────────────────────────────
  // Flattens annotations into the PDF bytes, then downloads / saves to a new file.
  // This is the ONLY operation that flattens.
  async function exportPdf() {
    if (!hasDocument || !fileName || !docBytes) return;
    try {
      setSaveState("saving");
      const flattenedBytes = await bridge.exportFlattened(docBytes, annotations);

      if (hasDesktopBridge) {
        const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
        const suggestedName = baseName.toLowerCase().endsWith(".pdf")
          ? `exported-${baseName}`
          : `exported-${baseName}.pdf`;
        const savedPath = await bridge.saveFile(flattenedBytes, suggestedName, ["pdf"]);
        if (!savedPath) { setSaveState("idle"); return; }
        setSaveState("saved");
        setViewerError("PDF exported successfully!");
        setTimeout(() => setViewerError(null), 3000);
        return;
      }

      if ("showSaveFilePicker" in window) {
        try {
          const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
          const suggestedName = baseName.toLowerCase().endsWith(".pdf")
            ? `exported-${baseName}`
            : `exported-${baseName}.pdf`;
          const handle = await (window as any).showSaveFilePicker({
            suggestedName,
            types: [{ description: "PDF Document", accept: { "application/pdf": [".pdf"] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(flattenedBytes);
          await writable.close();
          setSaveState("saved");
          setViewerError("PDF exported successfully!");
          setTimeout(() => setViewerError(null), 3000);
          return;
        } catch (err: any) {
          if (err.name === "AbortError") { setSaveState("idle"); return; }
          console.error("Export Picker failed, falling back to download", err);
        }
      }

      // Fallback: download flattened PDF.
      const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
      const finalName = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
      const blob = new Blob([flattenedBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `exported-${finalName}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSaveState("saved");
      setViewerError("PDF exported successfully!");
      setTimeout(() => setViewerError(null), 3000);
    } catch (err) {
      console.error(err);
      setViewerError("Failed to export PDF.");
      setSaveState("idle");
    }
  }

  return { savePdf, savePdfAs, exportPdf };
}
