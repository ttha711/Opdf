import { useState, useMemo, useEffect } from "react";

interface SplitModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  docBytes: Uint8Array | null;
  totalPages: number;
  setViewerError: (msg: string | null) => void;
}

type SplitMode = "all" | "range" | "extract";

interface SplitPart {
  name: string;
  pages: number[]; // 1-based page numbers
}

export function SplitModal({
  isOpen,
  onClose,
  fileName,
  docBytes,
  totalPages,
  setViewerError,
}: SplitModalProps) {
  const [mode, setMode] = useState<SplitMode>("range");
  const [rangeInput, setRangeInput] = useState("");
  const [extractInput, setExtractInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize input values based on totalPages
  useEffect(() => {
    if (totalPages > 1) {
      setRangeInput(`1-${Math.ceil(totalPages / 2)}, ${Math.ceil(totalPages / 2) + 1}-${totalPages}`);
      setExtractInput(`1, ${Math.min(3, totalPages)}, ${Math.min(5, totalPages)}-${totalPages}`);
    } else {
      setRangeInput("1");
      setExtractInput("1");
    }
  }, [totalPages, isOpen]);

  // Clean filename base
  const fileBase = useMemo(() => {
    const base = fileName.split(/[/\\]/).pop() || "document.pdf";
    return base.toLowerCase().endsWith(".pdf") ? base.slice(0, -4) : base;
  }, [fileName]);

  // Dynamic preview calculation
  const splitParts = useMemo<SplitPart[]>(() => {
    if (mode === "all") {
      const parts: SplitPart[] = [];
      for (let i = 1; i <= totalPages; i++) {
        parts.push({
          name: `page-${i}-${fileBase}.pdf`,
          pages: [i],
        });
      }
      return parts;
    }

    if (mode === "range") {
      const parts: SplitPart[] = [];
      const rawParts = rangeInput.split(",");
      for (const raw of rawParts) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(trimmed);
        if (match) {
          const start = Number(match[1]);
          const end = match[2] ? Number(match[2]) : start;
          const low = Math.min(start, end);
          const high = Math.max(start, end);
          const pages: number[] = [];
          for (let p = low; p <= high; p++) {
            if (p >= 1 && p <= totalPages) {
              pages.push(p);
            }
          }
          if (pages.length > 0) {
            parts.push({
              name: `pages-${low}-${high}-${fileBase}.pdf`,
              pages,
            });
          }
        }
      }
      return parts;
    }

    if (mode === "extract") {
      const pages = new Set<number>();
      const rawParts = extractInput.split(",");
      for (const raw of rawParts) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(trimmed);
        if (match) {
          const start = Number(match[1]);
          const end = match[2] ? Number(match[2]) : start;
          const low = Math.min(start, end);
          const high = Math.max(start, end);
          for (let p = low; p <= high; p++) {
            if (p >= 1 && p <= totalPages) {
              pages.add(p);
            }
          }
        }
      }
      const sortedPages = [...pages].sort((a, b) => a - b);
      if (sortedPages.length > 0) {
        return [
          {
            name: `extracted-${sortedPages.length}-pages-${fileBase}.pdf`,
            pages: sortedPages,
          },
        ];
      }
    }

    return [];
  }, [mode, rangeInput, extractInput, totalPages, fileBase]);

  if (!isOpen) return null;

  async function handleSplit() {
    if (!docBytes || splitParts.length === 0) return;
    setIsProcessing(true);
    setViewerError("Processing split...");
    try {
      const pdfLib = await import("pdf-lib");
      const sourceDoc = await pdfLib.PDFDocument.load(docBytes);
      const generatedFiles: Array<{ name: string; bytes: Uint8Array }> = [];

      for (const part of splitParts) {
        const childDoc = await pdfLib.PDFDocument.create();
        // copyPages takes 0-indexed page indices
        const indices = part.pages.map((p) => p - 1);
        const copiedPages = await childDoc.copyPages(sourceDoc, indices);
        copiedPages.forEach((page) => childDoc.addPage(page));
        const savedBytes = await childDoc.save();
        generatedFiles.push({ name: part.name, bytes: savedBytes });
      }

      if (generatedFiles.length === 1) {
        // Direct download of single PDF
        const file = generatedFiles[0];
        const blob = new Blob([file.bytes as any], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      } else if (generatedFiles.length > 1) {
        // Zip compress multiple PDFs
        const { zipSync } = await import("fflate");
        const zipData: Record<string, Uint8Array> = {};
        for (const file of generatedFiles) {
          zipData[file.name] = file.bytes;
        }
        const zipped = zipSync(zipData);
        const blob = new Blob([zipped as any], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileBase}-splitted.zip`;
        a.click();
        URL.revokeObjectURL(url);
      }

      setViewerError(null);
      onClose();
    } catch (err) {
      console.error(err);
      setViewerError("Failed to split document: " + err);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="premium-modal">
        {/* Header */}
        <div className="premium-modal-header">
          <h3 className="premium-modal-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-600">
              <path d="M8 2v20M16 2v20M2 12h20" />
            </svg>
            Advanced Split Document
          </h3>
          <button className="premium-modal-close" onClick={onClose} aria-label="Close dialog">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="premium-modal-body">
          {/* Active document metadata */}
          <div className="flex items-center justify-between rounded-lg p-3 border border-dashed" style={{ background: 'var(--ui-muted-bg)', borderColor: 'var(--border-color)' }}>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-450 uppercase tracking-wide">Source Document</p>
              <p className="text-sm font-semibold truncate text-[var(--text-primary)]">{fileName || "No document loaded"}</p>
            </div>
            <span className="flex-shrink-0 rounded bg-blue-100 dark:bg-blue-900/30 px-2 py-1 text-xs font-bold text-blue-600 dark:text-blue-400">
              {totalPages} {totalPages === 1 ? "Page" : "Pages"}
            </span>
          </div>

          {/* Mode Selector Radio Cards */}
          <div className="form-group">
            <label className="form-label">Choose Split Mode</label>
            <div className="radio-group">
              <div
                className={`radio-card ${mode === "range" ? "active" : ""}`}
                onClick={() => setMode("range")}
              >
                <div className="radio-card-header">
                  <input
                    type="radio"
                    checked={mode === "range"}
                    onChange={() => setMode("range")}
                    className="accent-blue-600"
                  />
                  Custom Ranges
                </div>
                <div className="radio-card-desc">Extract customized page blocks into files.</div>
              </div>

              <div
                className={`radio-card ${mode === "all" ? "active" : ""}`}
                onClick={() => setMode("all")}
              >
                <div className="radio-card-header">
                  <input
                    type="radio"
                    checked={mode === "all"}
                    onChange={() => setMode("all")}
                    className="accent-blue-600"
                  />
                  Extract All Pages
                </div>
                <div className="radio-card-desc">Generate one single-page PDF for every page.</div>
              </div>

              <div
                className={`radio-card ${mode === "extract" ? "active" : ""}`}
                onClick={() => setMode("extract")}
              >
                <div className="radio-card-header">
                  <input
                    type="radio"
                    checked={mode === "extract"}
                    onChange={() => setMode("extract")}
                    className="accent-blue-600"
                  />
                  Page Combination
                </div>
                <div className="radio-card-desc">Consolidate selected pages into one single file.</div>
              </div>
            </div>
          </div>

          {/* Contextual Forms */}
          {mode === "range" && (
            <div className="form-group">
              <label className="form-label" htmlFor="rangeInput">Define Custom Page Ranges</label>
              <input
                id="rangeInput"
                type="text"
                className="form-control"
                placeholder="Example: 1-2, 3-5, 6-10"
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
              />
              <span className="text-[11px] text-gray-500">
                Separate files using commas. (e.g. <code>1-3, 4-8</code> generates two PDFs).
              </span>
            </div>
          )}

          {mode === "extract" && (
            <div className="form-group">
              <label className="form-label" htmlFor="extractInput">Specify Pages to Consolidate</label>
              <input
                id="extractInput"
                type="text"
                className="form-control"
                placeholder="Example: 1, 3, 5-8"
                value={extractInput}
                onChange={(e) => setExtractInput(e.target.value)}
              />
              <span className="text-[11px] text-gray-500">
                All listed pages will be concatenated into a single PDF.
              </span>
            </div>
          )}

          {/* Output Preview */}
          <div className="preview-section">
            <span className="preview-title">
              Output Combination Preview ({splitParts.length} {splitParts.length === 1 ? "file" : "files"})
            </span>
            <div className="preview-grid">
              {splitParts.length === 0 ? (
                <div className="col-span-full py-8 text-center text-xs text-gray-400">
                  Please enter valid page numbers to generate previews.
                </div>
              ) : (
                splitParts.map((part, index) => (
                  <div key={index} className="preview-card">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" className="preview-card-icon flex-shrink-0">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <div className="preview-card-info">
                      <span className="preview-card-name" title={part.name}>{part.name}</span>
                      <span className="preview-card-pages">
                        Contains {part.pages.length} {part.pages.length === 1 ? "page" : "pages"}:{" "}
                        <strong>
                          {part.pages.length > 5
                            ? `${part.pages[0]}...${part.pages[part.pages.length - 1]}`
                            : part.pages.join(", ")}
                        </strong>
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="premium-modal-footer">
          <button className="btn-premium btn-premium-secondary" onClick={onClose} disabled={isProcessing}>
            Cancel
          </button>
          <button
            className="btn-premium btn-premium-primary"
            onClick={handleSplit}
            disabled={isProcessing || splitParts.length === 0}
          >
            {isProcessing ? "Processing Split..." : splitParts.length > 1 ? "Split into ZIP" : "Split & Download"}
          </button>
        </div>
      </div>
    </div>
  );
}
