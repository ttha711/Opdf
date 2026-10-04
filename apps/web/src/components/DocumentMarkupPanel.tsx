import { useEffect, useMemo, useState } from "react";
import type { MarkupOptions, MarkupTool } from "../hooks/useDocumentActions";

type DocumentMarkupPanelProps = {
  tool: MarkupTool;
  fileName: string;
  totalPages: number;
  onClose: () => void;
  onApply: (tool: MarkupTool, options: MarkupOptions) => Promise<void> | void;
};

const toolTitles: Record<MarkupTool, string> = {
  "page-numbers": "Page Numbers",
  header: "Header",
  footer: "Footer",
  bates: "Bates Numbering",
};

export function DocumentMarkupPanel({ tool, fileName, totalPages, onClose, onApply }: DocumentMarkupPanelProps) {
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

  const isPageNumbers = tool === "page-numbers";
  const isHeaderFooter = tool === "header" || tool === "footer";
  const isBates = tool === "bates";

  async function handleApply() {
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
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <aside className="h-full overflow-y-auto border-l border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-primary)]">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-4 py-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Document Markup</div>
          <h4 className="m-0 mt-0.5 text-sm font-bold">{toolTitles[tool]}</h4>
        </div>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--ui-hover-bg)]" title="Close tool" type="button">✕</button>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--ui-muted-bg)] p-3">
          <div className="truncate text-xs font-semibold" title={baseName}>{baseName}</div>
          <div className="mt-1 text-[11px] text-[var(--text-secondary)]">{totalPages} pages</div>
        </div>

        {isHeaderFooter ? (
          <label className="flex flex-col gap-1.5 text-xs font-semibold">
            Text
            <input className="form-control" value={text} onChange={(event) => setText(event.target.value)} />
          </label>
        ) : null}

        {(isPageNumbers || isBates) ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5 text-xs font-semibold">
              Prefix
              <input className="form-control" value={prefix} onChange={(event) => setPrefix(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold">
              Suffix
              <input className="form-control" value={suffix} onChange={(event) => setSuffix(event.target.value)} />
            </label>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          {(isPageNumbers || isBates) ? (
            <label className="flex flex-col gap-1.5 text-xs font-semibold">
              Start Number
              <input className="form-control" type="number" min="0" value={startNumber} onChange={(event) => setStartNumber(Number(event.target.value) || 0)} />
            </label>
          ) : null}
          <label className="flex flex-col gap-1.5 text-xs font-semibold">
            Font Size
            <input className="form-control" type="number" min="6" max="72" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value) || 10)} />
          </label>
        </div>

        {!isBates ? (
          <label className="flex items-center justify-between gap-3 text-xs font-semibold">
            Color
            <input className="h-8 w-12 rounded border border-[var(--border-color)]" type="color" value={fontColor} onChange={(event) => setFontColor(event.target.value)} />
          </label>
        ) : null}

        {isPageNumbers ? (
          <>
            <label className="flex flex-col gap-1.5 text-xs font-semibold">
              Position
              <select className="form-control" value={position} onChange={(event) => setPosition(event.target.value as NonNullable<MarkupOptions["position"]>)}>
                <option value="top-left">Top Left</option>
                <option value="top-center">Top Center</option>
                <option value="top-right">Top Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-center">Bottom Center</option>
                <option value="bottom-right">Bottom Right</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1.5 text-xs font-semibold">
                From Page
                <input className="form-control" type="number" min="1" max={totalPages} value={pageStart} onChange={(event) => setPageStart(Number(event.target.value) || 1)} />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold">
                To Page
                <input className="form-control" type="number" min="1" max={totalPages} value={pageEnd} onChange={(event) => setPageEnd(Number(event.target.value) || totalPages)} />
              </label>
            </div>
          </>
        ) : null}

        {isHeaderFooter ? (
          <label className="flex flex-col gap-1.5 text-xs font-semibold">
            Alignment
            <select className="form-control" value={align} onChange={(event) => setAlign(event.target.value as NonNullable<MarkupOptions["align"]>)}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
        ) : null}

        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--ui-muted-bg)] p-3 text-xs text-[var(--text-secondary)]">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide">Preview</div>
          <div className="font-semibold text-[var(--text-primary)]">
            {isHeaderFooter ? text || baseName : `${prefix}${String(startNumber).padStart(isBates ? 6 : 1, "0")}${suffix}`}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleApply()}
          disabled={isApplying}
          className="h-9 w-full rounded-md bg-[var(--acrobat-blue)] text-xs font-bold text-white hover:bg-[var(--acrobat-blue-hover)] disabled:opacity-50"
        >
          {isApplying ? "Applying..." : "Apply to Document"}
        </button>
      </div>
    </aside>
  );
}
