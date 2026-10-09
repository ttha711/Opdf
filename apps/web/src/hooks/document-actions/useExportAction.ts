import type { Dispatch, SetStateAction } from "react";
import type { useOpdfBridge } from "../useOpdfBridge";
import { saveWebState, computeFileHash, saveAnnotationsByHash } from "../../lib/web-storage";
import { commitPendingNativeInlineEdit } from "../../lib/nativeEditRuntime";

export function useExportAction({
  bridge,
  hasDocument,
  hasDesktopBridge,
  fileName,
  docBytes,
  sourceIdentity,
  getDocumentBytes,
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
  sourceIdentity: string;
  getDocumentBytes: () => Promise<Uint8Array | null>;
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
    documentIdentity?: string;
    annotations?: any[];
    pageRotations?: Record<number, number>;
  }) => void;
}) {
  // ── Save (Ctrl+S) ──────────────────────────────────────────────────────────
  // Desktop: writes docBytes to existing path + saves annotations. No flatten.
  // Web: saves docBytes + annotations to IndexedDB draft. No download, no flatten.
  async function savePdf(options: { silent?: boolean } = {}) {
    if (!hasDocument || !fileName) return false;
    try {
      const inlineEditBytes = options.silent ? null : await commitPendingNativeInlineEdit();
      setSaveState("saving");

      let storageKey = sourceIdentity;
      const isServerDocument = sourceIdentity.startsWith("server://");
      // Native Edit PDF publishes authoritative working bytes before the
      // revised viewer document is ready. Save those bytes immediately:
      // re-materializing the old/reloading viewer can hang or return stale PDF.
      let bytes = inlineEditBytes ?? ((isServerDocument && docBytes)
        ? docBytes
        : (await getDocumentBytes()) ?? docBytes);

      if (hasDesktopBridge) {
        if (!inlineEditBytes) bytes = (await getDocumentBytes()) ?? bytes;
        if (!bytes) throw new Error("Document bytes are unavailable.");
        storageKey = await computeFileHash(bytes);
        await bridge.saveDocument(fileName, bytes);
        if (bridge.replaceAnnotations) {
          await bridge.replaceAnnotations(fileName, annotations);
        }
      } else if (isServerDocument) {
        if (!bytes) throw new Error("Document bytes are unavailable.");
        await bridge.saveDocument(sourceIdentity, bytes);
        if (bridge.replaceAnnotations) {
          await bridge.replaceAnnotations(sourceIdentity, annotations);
        }
      } else if (!storageKey && bytes) {
        storageKey = await computeFileHash(bytes);
      }

      if (storageKey) {
        await saveAnnotationsByHash(storageKey, annotations);
      }

      if (hasDesktopBridge || isServerDocument) {
        markDocumentSaved({
          fileName,
          docBytes: bytes,
          documentIdentity: sourceIdentity,
          annotations,
        });
        setSaveState("saved");
        if (!options.silent) {
          setViewerError(isServerDocument ? "Saved to OPDF Server." : "File saved successfully!");
          setTimeout(() => setViewerError(null), 3000);
        }
        return true;
      }

      await saveWebState({ fileName, annotations, page: 1 });
      // Browsers cannot overwrite an uploaded File without its writable handle.
      // Keep silent autosave limited to review state; it must not falsely mark
      // unsaved PDF byte edits as durably written to disk.
      if (options.silent) {
        setSaveState("idle");
        return false;
      }
      if (!bytes) throw new Error("Document bytes are unavailable.");
      const baseName = fileName.split(/[/\\]/).pop() || "document.pdf";
      const finalName = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = finalName;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      markDocumentSaved({ fileName, docBytes: bytes, documentIdentity: sourceIdentity, annotations });
      setSaveState("saved");
      setViewerError("Edited PDF downloaded. Replace the original file manually if needed; annotations need Export PDF to embed.");
      setTimeout(() => setViewerError(null), 5000);
      return true;
    } catch (err) {
      console.error(err);
      if (!options.silent) {
        setViewerError("Failed to save PDF.");
      }
      setSaveState("idle");
      return false;
    }
  }

  // ── Save As (Ctrl+Shift+S) ─────────────────────────────────────────────────
  // Lets the user pick a new location/name. Saves raw docBytes (no flatten).
  // Annotations are kept in state so editing continues on the new file.
  async function savePdfAs() {
    if (!hasDocument || !fileName) return;
    try {
      const inlineEditBytes = await commitPendingNativeInlineEdit();
      setSaveState("saving");
      const bytes = inlineEditBytes ?? (await getDocumentBytes()) ?? docBytes;
      if (!bytes) throw new Error("Document bytes are unavailable.");

      if (hasDesktopBridge) {
        const savedPath = await bridge.saveDocumentAs(bytes);
        if (!savedPath) { setSaveState("idle"); return; }
        if (bridge.replaceAnnotations) {
          await bridge.replaceAnnotations(savedPath, annotations);
        }
        setDocBytes(bytes);
        setFileName(savedPath);
        markDocumentSaved({ fileName: savedPath, docBytes: bytes, annotations });
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
          await writable.write(bytes);
          await writable.close();
          const newName = handle.name ?? fileName;
          setFileName(newName);
          markDocumentSaved({ fileName: newName, docBytes: bytes, annotations });
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
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      markDocumentSaved({ fileName, docBytes: bytes, annotations });
      setSaveState("saved");
      setViewerError("Original PDF downloaded without embedded OPDF annotations. Use Export PDF for a reviewed copy.");
      setTimeout(() => setViewerError(null), 5000);
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
    if (!hasDocument || !fileName) return;
    try {
      setSaveState("saving");
      const bytes = (await getDocumentBytes()) ?? docBytes;
      if (!bytes) throw new Error("Document bytes are unavailable.");
      const flattenedBytes = await bridge.exportFlattened(bytes, annotations);

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
