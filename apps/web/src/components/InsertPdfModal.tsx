import { useState, useEffect, useRef } from "react";

interface InsertFile {
  name: string;
  bytes: Uint8Array;
  totalPages: number;
  size: number;
}

interface InsertPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  docBytes: Uint8Array | null;
  totalPages: number;
  currentPage: number;
  onInsertComplete: (insertedBytes: Uint8Array, targetPage: number) => void;
  setViewerError: (msg: string | null) => void;
  hasDesktopBridge: boolean;
  bridge: any;
}

export function InsertPdfModal({
  isOpen,
  onClose,
  fileName,
  docBytes,
  totalPages,
  currentPage,
  onInsertComplete,
  setViewerError,
  hasDesktopBridge,
  bridge,
}: InsertPdfModalProps) {
  const [selectedFile, setSelectedFile] = useState<InsertFile | null>(null);
  const [targetPage, setTargetPage] = useState<number>(currentPage);
  const [position, setPosition] = useState<"before" | "after">("after");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync targetPage to currentPage when opening the modal
  useEffect(() => {
    if (isOpen) {
      setTargetPage(currentPage);
      setSelectedFile(null);
      setIsProcessing(false);
    }
  }, [isOpen, currentPage]);

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

  // Process file bytes and extract pages using pdf-lib
  async function processSelectedFile(file: File) {
    setIsProcessing(true);
    setViewerError("Reading selected PDF...");
    try {
      const pdfLib = await import("pdf-lib");
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      try {
        const doc = await pdfLib.PDFDocument.load(bytes);
        setSelectedFile({
          name: file.name,
          bytes,
          totalPages: doc.getPageCount(),
          size: file.size,
        });
        setViewerError(null);
      } catch (err) {
        alert(`Failed to load "${file.name}": Not a valid PDF document or it is password protected.`);
        setViewerError(null);
      }
    } catch (err) {
      console.error(err);
      setViewerError("Failed to read selected file.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Handle selected local files
  async function handleFileSelection(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;
    await processSelectedFile(selectedFiles[0]);
  }

  // Drag and Drop Handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        await processSelectedFile(file);
      } else {
        alert("Please drop a valid PDF file.");
      }
    }
  }

  // Perform PDF insert operation
  async function handleInsert() {
    if (!docBytes || !selectedFile) return;
    setIsProcessing(true);
    setViewerError("Inserting pages...");
    try {
      // Validate bounds
      if (!Number.isInteger(targetPage) || targetPage < 1 || targetPage > Math.max(totalPages, 1)) {
        throw new Error("Invalid target page number");
      }

      const next = await bridge.insertPages(docBytes, {
        targetPage,
        position,
        bytes: selectedFile.bytes,
      });

      onInsertComplete(next, targetPage);
      setViewerError(null);
      onClose();
    } catch (err) {
      console.error(err);
      setViewerError(err instanceof Error ? err.message : "Failed to insert PDF pages.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="premium-modal max-w-[500px]">
        {/* Hidden Input Picker */}
        <input
          type="file"
          ref={fileInputRef}
          accept="application/pdf"
          className="hidden"
          onChange={handleFileSelection}
          aria-hidden="true"
        />

        {/* Header */}
        <div className="premium-modal-header">
          <h3 className="premium-modal-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-600">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            Insert PDF Document
          </h3>
          <button className="premium-modal-close" onClick={onClose} aria-label="Close dialog">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="premium-modal-body">
          {/* Active target document context */}
          <div className="flex items-center justify-between rounded-lg p-3 border border-dashed" style={{ background: 'var(--ui-muted-bg)', borderColor: 'var(--border-color)' }}>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Target Document</p>
              <p className="text-sm font-semibold truncate text-[var(--text-primary)]">{fileName || "document.pdf"}</p>
            </div>
            <span className="flex-shrink-0 rounded bg-blue-100 dark:bg-blue-900/30 px-2 py-1 text-xs font-bold text-blue-600 dark:text-blue-400">
              {totalPages} {totalPages === 1 ? "page" : "pages"}
            </span>
          </div>

          {/* Step 1: Document selection */}
          <div className="form-group">
            <label className="form-label">Select Document to Insert</label>
            {!selectedFile ? (
              <div
                className="flex flex-col items-center justify-center p-8 rounded-xl border border-dashed text-center transition-all"
                style={{
                  background: isDragOver ? 'var(--ui-accent-bg)' : 'var(--ui-muted-bg)',
                  borderColor: isDragOver ? 'var(--acrobat-blue)' : 'var(--border-color)'
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 mb-2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                <p className="text-xs text-[var(--text-secondary)] mb-3">
                  Drag and drop your PDF here, or
                </p>
                <button
                  className="btn-premium btn-premium-outline py-1 px-4 text-xs font-semibold"
                  onClick={triggerFilePicker}
                  disabled={isProcessing}
                  type="button"
                >
                  Browse PDF File
                </button>
              </div>
            ) : (
              <div className="merge-stack-item">
                <div className="merge-stack-info">
                  {/* PDF Document Icon */}
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500 flex-shrink-0">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <div className="merge-stack-details">
                    <span className="merge-stack-name" title={selectedFile.name}>{selectedFile.name}</span>
                    <span className="merge-stack-meta">
                      {selectedFile.totalPages} {selectedFile.totalPages === 1 ? "page" : "pages"} • {formatSize(selectedFile.size)}
                    </span>
                  </div>
                </div>
                <button
                  className="btn-premium btn-premium-secondary py-1 px-3 text-xs"
                  onClick={triggerFilePicker}
                  disabled={isProcessing}
                  type="button"
                >
                  Change
                </button>
              </div>
            )}
          </div>

          {selectedFile && (
            <>
              {/* Target insertion page input */}
              <div className="form-group">
                <label className="form-label" htmlFor="insertTargetPage">Insert At Page Number</label>
                <div className="flex items-center gap-3">
                  <input
                    id="insertTargetPage"
                    type="number"
                    min="1"
                    max={totalPages}
                    className="form-control max-w-[120px]"
                    value={targetPage}
                    onChange={(e) => setTargetPage(Math.min(totalPages, Math.max(1, Number(e.target.value) || 1)))}
                    disabled={isProcessing}
                  />
                  <span className="text-xs text-[var(--text-secondary)]">
                    Specify the page number of the target document (1 to {totalPages}).
                  </span>
                </div>
              </div>

              {/* Placement selection radio cards */}
              <div className="form-group">
                <label className="form-label">Position Placement</label>
                <div className="radio-group">
                  <div
                    className={`radio-card ${position === "after" ? "active" : ""}`}
                    onClick={() => setPosition("after")}
                  >
                    <div className="radio-card-header">
                      <input
                        type="radio"
                        checked={position === "after"}
                        onChange={() => setPosition("after")}
                        className="accent-blue-600"
                        disabled={isProcessing}
                      />
                      After Page
                    </div>
                    <div className="radio-card-desc">Insert pages immediately following target page.</div>
                  </div>

                  <div
                    className={`radio-card ${position === "before" ? "active" : ""}`}
                    onClick={() => setPosition("before")}
                  >
                    <div className="radio-card-header">
                      <input
                        type="radio"
                        checked={position === "before"}
                        onChange={() => setPosition("before")}
                        className="accent-blue-600"
                        disabled={isProcessing}
                      />
                      Before Page
                    </div>
                    <div className="radio-card-desc">Insert pages immediately preceding target page.</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="premium-modal-footer">
          <button className="btn-premium btn-premium-secondary" onClick={onClose} disabled={isProcessing} type="button">
            Cancel
          </button>
          <button
            className="btn-premium btn-premium-primary"
            onClick={handleInsert}
            disabled={isProcessing || !selectedFile}
            type="button"
          >
            {isProcessing ? "Processing..." : "Insert PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
