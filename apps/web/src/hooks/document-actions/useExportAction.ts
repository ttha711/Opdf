import type { Dispatch, SetStateAction } from "react";
import type { useOpdfBridge } from "../useOpdfBridge";

export function useExportAction({
  bridge,
  hasDocument,
  hasDesktopBridge,
  fileName,
  docBytes,
  annotations,
  setViewerError,
}: {
  bridge: ReturnType<typeof useOpdfBridge>;
  hasDocument: boolean;
  hasDesktopBridge: boolean;
  fileName: string;
  docBytes: Uint8Array | null;
  annotations: any[];
  setViewerError: Dispatch<SetStateAction<string | null>>;
}) {
  async function exportPdf() {
    if (!hasDocument || !fileName || !docBytes) return;
    try {
      const flattenedBytes = await bridge.exportFlattened(docBytes, annotations);
      if (hasDesktopBridge) {
        await bridge.saveDocumentAs(flattenedBytes);
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
            setViewerError("File saved successfully!");
            setTimeout(() => setViewerError(null), 3000);
            return;
          } catch (err: any) {
            // If user cancels, just return
            if (err.name === "AbortError") return;
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
      }
    } catch (err) {
      console.error(err);
      setViewerError("Failed to export PDF.");
    }
  }

  return { exportPdf };
}
