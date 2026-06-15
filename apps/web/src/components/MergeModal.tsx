import { useState, useEffect, useRef } from "react";
import { toast } from "./ToastProvider";

interface MergeFile {
  id: string;
  name: string;
  bytes: Uint8Array;
  totalPages: number;
  size: number;
}

interface MergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  docBytes: Uint8Array | null;
  totalPages: number;
  onMergeComplete: (mergedBytes: Uint8Array) => void;
  setViewerError: (msg: string | null) => void;
}

export function MergeModal({
  isOpen,
  onClose,
  fileName,
  docBytes,
  totalPages,
  onMergeComplete,
  setViewerError,
}: MergeModalProps) {
  const [files, setFiles] = useState<MergeFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize with active document
  useEffect(() => {
    if (isOpen && docBytes) {
      setFiles([
        {
          id: "active-doc",
          name: fileName || "document.pdf",
          bytes: docBytes,
          totalPages: totalPages,
          size: docBytes.length,
        },
      ]);
    }
  }, [isOpen, docBytes, fileName, totalPages]);

  if (!isOpen) return null;

  // Format file size helper
  function formatSize(bytes: number) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  // Trigger hidden input file picker
  function triggerFilePicker() {
    fileInputRef.current?.click();
  }

  // Handle selected local files
  async function handleFileSelection(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsProcessing(true);
    setViewerError("Reading selected PDFs...");
    try {
      const pdfLib = await import("pdf-lib");
      const loaded: MergeFile[] = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        // Load document just to verify it's a valid PDF and get page count
        try {
          const doc = await pdfLib.PDFDocument.load(bytes);
          loaded.push({
            id: `file-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            bytes,
            totalPages: doc.getPageCount(),
            size: file.size,
          });
        } catch {
          toast.error(`Đã bỏ qua "${file.name}": Tệp PDF không hợp lệ hoặc đang được bảo vệ bằng mật khẩu.`);
        }
      }

      setFiles((prev) => [...prev, ...loaded]);
      setViewerError(null);
    } catch (err) {
      console.error(err);
      setViewerError("Failed to read selected files.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Move up in stack
  function moveUp(index: number) {
    if (index === 0) return;
    setFiles((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index - 1];
      next[index - 1] = temp;
      return next;
    });
  }

  // Move down in stack
  function moveDown(index: number) {
    if (index === files.length - 1) return;
    setFiles((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index + 1];
      next[index + 1] = temp;
      return next;
    });
  }

  // Remove file from stack
  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  // Calculate output pages summary
  const totalMergedPages = files.reduce((sum, f) => sum + f.totalPages, 0);

  // Perform merge operation
  async function compileMerge(mode: "view" | "download") {
    if (files.length === 0) return;
    setIsProcessing(true);
    setViewerError("Merging documents...");
    try {
      const pdfLib = await import("pdf-lib");
      const outDoc = await pdfLib.PDFDocument.create();

      for (const file of files) {
        const sourceDoc = await pdfLib.PDFDocument.load(file.bytes);
        const copiedPages = await outDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
        copiedPages.forEach((page) => outDoc.addPage(page));
      }

      const mergedBytes = await outDoc.save();

      if (mode === "view") {
        // Load directly in Opdf viewer
        onMergeComplete(mergedBytes);
      } else {
        // Download immediate file
        const blob = new Blob([mergedBytes as any], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const nameBase = files[0].name.toLowerCase().endsWith(".pdf") ? files[0].name.slice(0, -4) : files[0].name;
        a.download = `${nameBase}-merged.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }

      setViewerError(null);
      onClose();
    } catch (err) {
      console.error(err);
      setViewerError("Failed to merge documents: " + err);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="premium-modal">
        {/* Hidden Input Picker */}
        <input
          type="file"
          ref={fileInputRef}
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={handleFileSelection}
          aria-hidden="true"
        />

        {/* Header */}
        <div className="premium-modal-header">
          <h3 className="premium-modal-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-600">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Advanced Merge Documents
          </h3>
          <button className="premium-modal-close" onClick={onClose} aria-label="Close dialog">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="premium-modal-body">
          {/* File stack description */}
          <div className="flex items-center justify-between">
            <span className="form-label">Sort Merge Stack (First to Last)</span>
            <button
              className="btn-premium btn-premium-outline py-1 px-3 text-xs"
              onClick={triggerFilePicker}
              disabled={isProcessing}
            >
              + Add PDF File
            </button>
          </div>

          {/* Merge Stack List */}
          <div className="merge-stack">
            {files.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400">
                No documents in the merge stack. Click "+ Add PDF File" to select files.
              </div>
            ) : (
              files.map((file, idx) => (
                <div key={file.id} className="merge-stack-item">
                  <div className="merge-stack-info">
                    {/* PDF Document Red Icon */}
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500 flex-shrink-0">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <div className="merge-stack-details">
                      <span className="merge-stack-name" title={file.name}>{file.name}</span>
                      <span className="merge-stack-meta">
                        {file.totalPages} {file.totalPages === 1 ? "page" : "pages"} • {formatSize(file.size)}
                      </span>
                    </div>
                  </div>

                  {/* Move & Sorting arrows + Remove */}
                  <div className="merge-stack-actions">
                    <button
                      className="merge-action-btn"
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0 || isProcessing}
                      title="Move Up"
                      aria-label="Move Up"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    </button>
                    <button
                      className="merge-action-btn"
                      onClick={() => moveDown(idx)}
                      disabled={idx === files.length - 1 || isProcessing}
                      title="Move Down"
                      aria-label="Move Down"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    <button
                      className="merge-action-btn delete"
                      onClick={() => removeFile(file.id)}
                      disabled={isProcessing}
                      title="Remove"
                      aria-label="Remove"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Merge stack stats */}
          <div className="flex items-center justify-between rounded-lg p-3 border" style={{ background: 'var(--ui-muted-bg)', borderColor: 'var(--border-color)' }}>
            <span className="text-xs text-[var(--text-secondary)]">
              Output Stack: <strong>{files.length}</strong> {files.length === 1 ? "file" : "files"}
            </span>
            <span className="text-xs text-blue-600 dark:text-blue-400 font-bold">
              Total Compiled Pages: {totalMergedPages}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="premium-modal-footer">
          <button className="btn-premium btn-premium-secondary" onClick={onClose} disabled={isProcessing}>
            Cancel
          </button>
          <button
            className="btn-premium btn-premium-outline"
            onClick={() => compileMerge("download")}
            disabled={isProcessing || files.length < 2}
          >
            Merge & Download
          </button>
          <button
            className="btn-premium btn-premium-primary"
            onClick={() => compileMerge("view")}
            disabled={isProcessing || files.length < 2}
          >
            {isProcessing ? "Merging PDFs..." : "Merge & Load Viewer"}
          </button>
        </div>
      </div>
    </div>
  );
}
