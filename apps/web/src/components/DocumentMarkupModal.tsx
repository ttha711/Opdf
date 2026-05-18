import { useEffect, useMemo, useState } from "react";
import type { MarkupOptions, MarkupTool } from "../hooks/useDocumentActions";

type DocumentMarkupModalProps = {
  tool: MarkupTool | null;
  fileName: string;
  totalPages: number;
  onClose: () => void;
  onApply: (tool: MarkupTool, options: MarkupOptions) => Promise<void> | void;
};

const toolTitles: Record<MarkupTool, string> = {
  "page-numbers": "Add Page Numbers",
  header: "Add Header",
  footer: "Add Footer",
  bates: "Add Bates Numbering",
};

export function DocumentMarkupModal({ tool, fileName, totalPages, onClose, onApply }: DocumentMarkupModalProps) {
  const baseName = useMemo(() => fileName.split(/[/\\]/).pop() || "document.pdf", [fileName]);
  const [text, setText] = useState(baseName);
  const [prefix, setPrefix] = useState("Page ");
  const [suffix, setSuffix] = useState("");
  const [startNumber, setStartNumber] = useState(1);
  const [fontSize, setFontSize] = useState(11);
  const [fontColor, setFontColor] = useState("#111827");
  const [position, setPosition] = useState<NonNullable<MarkupOptions["position"]>>("bottom-center");
  const [align, setAlign] = useState<NonNullable<MarkupOptions["align"]>>("center");
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd, setPageEnd] = useState(Math.max(1, totalPages));
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (!tool) return;
    setText(baseName);
    setPrefix(tool === "bates" ? "OPDF-" : "Page ");
    setSuffix("");
    setStartNumber(1);
    setFontSize(tool === "bates" ? 8 : tool === "page-numbers" ? 11 : 10);
    setFontColor(tool === "bates" ? "#000000" : tool === "page-numbers" ? "#111827" : "#374151");
    setPosition("bottom-center");
    setAlign("center");
    setPageStart(1);
    setPageEnd(Math.max(1, totalPages));
  }, [baseName, tool, totalPages]);

  if (!tool) return null;

  const isPageNumbers = tool === "page-numbers";
  const isHeaderFooter = tool === "header" || tool === "footer";
  const isBates = tool === "bates";

  async function handleApply() {
    if (!tool) return;
    setIsApplying(true);
    try {
      await onApply(tool, {
        text,
        prefix,
        suffix,
        startNumber,
        fontSize,
        fontColor,
        position,
        align,
        pageStart: Math.min(pageStart, pageEnd),
        pageEnd: Math.max(pageStart, pageEnd),
      });
      onClose();
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={toolTitles[tool]}>
      <div className="premium-modal max-w-[520px]">
        <div className="premium-modal-header">
          <h3 className="premium-modal-title">{toolTitles[tool]}</h3>
          <button className="premium-modal-close" onClick={onClose} aria-label="Close dialog" type="button">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="premium-modal-body">
          <div className="flex items-center justify-between rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="min-w-0">
              <p className="m-0 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">Source Document</p>
              <p className="m-0 truncate text-sm font-semibold text-[var(--text-primary)]">{baseName}</p>
            </div>
            <span className="rounded bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {totalPages} pages
            </span>
          </div>

          {isHeaderFooter ? (
            <div className="form-group">
              <label className="form-label" htmlFor="markupText">Text</label>
              <input id="markupText" className="form-control" value={text} onChange={(event) => setText(event.target.value)} />
            </div>
          ) : null}

          {(isPageNumbers || isBates) ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <label className="form-label" htmlFor="markupPrefix">Prefix</label>
                <input id="markupPrefix" className="form-control" value={prefix} onChange={(event) => setPrefix(event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="markupSuffix">Suffix</label>
                <input id="markupSuffix" className="form-control" value={suffix} onChange={(event) => setSuffix(event.target.value)} />
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            {(isPageNumbers || isBates) ? (
              <div className="form-group">
                <label className="form-label" htmlFor="markupStart">Start Number</label>
                <input id="markupStart" className="form-control" type="number" min="0" value={startNumber} onChange={(event) => setStartNumber(Number(event.target.value) || 0)} />
              </div>
            ) : null}

            <div className="form-group">
              <label className="form-label" htmlFor="markupFontSize">Font Size</label>
              <input id="markupFontSize" className="form-control" type="number" min="6" max="72" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value) || 10)} />
            </div>

            {!isBates ? (
              <div className="form-group">
                <label className="form-label" htmlFor="markupColor">Color</label>
                <input id="markupColor" className="form-control h-10 p-1" type="color" value={fontColor} onChange={(event) => setFontColor(event.target.value)} />
              </div>
            ) : null}
          </div>

          {isPageNumbers ? (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="markupPosition">Position</label>
                <select id="markupPosition" className="form-control" value={position} onChange={(event) => setPosition(event.target.value as NonNullable<MarkupOptions["position"]>)}>
                  <option value="top-left">Top Left</option>
                  <option value="top-center">Top Center</option>
                  <option value="top-right">Top Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="bottom-center">Bottom Center</option>
                  <option value="bottom-right">Bottom Right</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label" htmlFor="pageStart">From Page</label>
                  <input id="pageStart" className="form-control" type="number" min="1" max={totalPages} value={pageStart} onChange={(event) => setPageStart(Number(event.target.value) || 1)} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="pageEnd">To Page</label>
                  <input id="pageEnd" className="form-control" type="number" min="1" max={totalPages} value={pageEnd} onChange={(event) => setPageEnd(Number(event.target.value) || totalPages)} />
                </div>
              </div>
            </>
          ) : null}

          {isHeaderFooter ? (
            <div className="form-group">
              <label className="form-label" htmlFor="markupAlign">Alignment</label>
              <select id="markupAlign" className="form-control" value={align} onChange={(event) => setAlign(event.target.value as NonNullable<MarkupOptions["align"]>)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          ) : null}

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-[var(--text-secondary)] dark:border-gray-700 dark:bg-gray-800">
            Preview: {isHeaderFooter ? text || baseName : `${prefix}${String(startNumber).padStart(isBates ? 6 : 1, "0")}${suffix}`}
          </div>
        </div>

        <div className="premium-modal-footer">
          <button className="btn-premium btn-premium-secondary" onClick={onClose} disabled={isApplying} type="button">
            Cancel
          </button>
          <button className="btn-premium btn-premium-primary" onClick={handleApply} disabled={isApplying} type="button">
            {isApplying ? "Applying..." : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
