import { useMemo, useState } from "react";
import { parsePageList } from "../../lib/document-tools";

type BasicPdfToolId =
  | "rotate-pdf"
  | "delete-pages"
  | "extract-pages"
  | "crop-pdf"
  | "protect-pdf"
  | "unlock-pdf";

export function BasicPdfToolsPanel({
  toolId,
  fileName,
  totalPages,
  getDocumentBytes,
  bridge,
  replaceDocumentBytes,
  onLoadConvertedPdf,
  setViewerError,
}: {
  toolId: BasicPdfToolId;
  fileName: string;
  totalPages: number;
  getDocumentBytes: () => Promise<Uint8Array | null>;
  bridge: any;
  replaceDocumentBytes: (bytes: Uint8Array, nextPage?: number) => void;
  onLoadConvertedPdf: (bytes: Uint8Array, fileName: string) => void;
  setViewerError: (msg: string | null) => void;
}) {
  const [pages, setPages] = useState(totalPages > 1 ? `1-${totalPages}` : "1");
  const [margin, setMargin] = useState(5);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const baseName = useMemo(() => {
    const clean = fileName.split(/[/\\]/).pop() || "document.pdf";
    return clean.replace(/\.pdf$/i, "");
  }, [fileName]);

  const run = async (operation?: "left" | "right") => {
    setBusy(true);
    try {
      const bytes = await getDocumentBytes();
      if (!bytes) throw new Error("PDF bytes are unavailable.");

      if (toolId === "rotate-pdf") {
        const selected = parsePageList(pages, totalPages);
        if (!selected.length) throw new Error("Select at least one valid page.");
        const next = await bridge.rotatePages(bytes, selected, operation === "left" ? -90 : 90);
        replaceDocumentBytes(next);
        setViewerError("Pages rotated.");
      } else if (toolId === "delete-pages") {
        const selected = parsePageList(pages, totalPages);
        if (!selected.length) throw new Error("Select at least one valid page.");
        if (selected.length >= totalPages) throw new Error("A PDF must keep at least one page.");
        const next = await bridge.deletePages(bytes, selected);
        replaceDocumentBytes(next, 1);
        setViewerError(`${selected.length} page(s) deleted.`);
      } else if (toolId === "extract-pages") {
        const selected = parsePageList(pages, totalPages);
        if (!selected.length) throw new Error("Select at least one valid page.");
        const pdfLib = await import("pdf-lib");
        const source = await pdfLib.PDFDocument.load(bytes);
        const output = await pdfLib.PDFDocument.create();
        const copied = await output.copyPages(source, selected.map((page) => page - 1));
        copied.forEach((page) => output.addPage(page));
        onLoadConvertedPdf(await output.save(), `${baseName}-extracted.pdf`);
        setViewerError(`${selected.length} page(s) extracted to a new PDF.`);
      } else if (toolId === "crop-pdf") {
        const safeMargin = Math.min(45, Math.max(0, margin)) / 100;
        const selected = parsePageList(pages, totalPages);
        if (!selected.length) throw new Error("Select at least one valid page.");
        let next = bytes;
        for (const page of selected) {
          next = await bridge.cropPage(next, {
            page,
            x: safeMargin,
            y: safeMargin,
            width: 1 - safeMargin * 2,
            height: 1 - safeMargin * 2,
          });
        }
        replaceDocumentBytes(next, selected[0]);
        setViewerError("Crop applied.");
      } else if (toolId === "protect-pdf") {
        if (bridge.capabilities?.encrypt === false) {
          throw new Error("Protect PDF requires OPDF Server or Desktop.");
        }
        if (password.length < 4) throw new Error("Use a password with at least 4 characters.");
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        const next = await bridge.encryptPdf(bytes, { userPassword: password, ownerPassword: password });
        replaceDocumentBytes(next);
        setViewerError("Password protection applied. Save the PDF to keep it.");
      } else if (toolId === "unlock-pdf") {
        if (bridge.capabilities?.encrypt === false) {
          throw new Error("Unlock PDF requires OPDF Server or Desktop.");
        }
        if (!password) throw new Error("Enter the current PDF password.");
        const next = await bridge.decryptPdf(bytes, password);
        replaceDocumentBytes(next);
        setViewerError("PDF unlocked. Save a copy to keep the unlocked version.");
      }

      window.setTimeout(() => setViewerError(null), 3500);
    } catch (error) {
      setViewerError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const pageTools = ["rotate-pdf", "delete-pages", "extract-pages", "crop-pdf"].includes(toolId);

  return (
    <>
      {pageTools ? (
        <label className="flex flex-col gap-1.5 text-xs font-semibold">
          Pages
          <input
            value={pages}
            onChange={(event) => setPages(event.target.value)}
            placeholder={totalPages > 1 ? `e.g. 1-3, 5, ${totalPages}` : "1"}
            className="h-9 rounded border border-[var(--border-color)] bg-[var(--bg-toolbar)] px-2 text-sm font-normal"
          />
          <span className="font-normal text-[10px] text-[var(--text-secondary)]">
            Use page numbers and ranges, for example 1-3, 5, 8.
          </span>
        </label>
      ) : null}

      {toolId === "rotate-pdf" ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={() => void run("left")} className="h-10 rounded border border-[var(--border-color)] font-semibold hover:bg-[var(--ui-hover-bg)] disabled:opacity-50">
            ↺ Rotate left
          </button>
          <button type="button" disabled={busy} onClick={() => void run("right")} className="h-10 rounded border border-[var(--border-color)] font-semibold hover:bg-[var(--ui-hover-bg)] disabled:opacity-50">
            ↻ Rotate right
          </button>
        </div>
      ) : null}

      {toolId === "crop-pdf" ? (
        <label className="flex flex-col gap-1.5 text-xs font-semibold">
          Crop margin
          <div className="flex items-center gap-2">
            <input type="range" min="0" max="30" value={margin} onChange={(event) => setMargin(Number(event.target.value))} className="flex-1" />
            <span className="w-10 text-right">{margin}%</span>
          </div>
        </label>
      ) : null}

      {toolId === "protect-pdf" || toolId === "unlock-pdf" ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-semibold">
            {toolId === "protect-pdf" ? "New password" : "Current password"}
            <input
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-9 rounded border border-[var(--border-color)] bg-[var(--bg-toolbar)] px-2 text-sm font-normal"
            />
          </label>
          {toolId === "protect-pdf" ? (
            <label className="flex flex-col gap-1.5 text-xs font-semibold">
              Confirm password
              <input
                type="password"
                autoComplete="off"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="h-9 rounded border border-[var(--border-color)] bg-[var(--bg-toolbar)] px-2 text-sm font-normal"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {toolId !== "rotate-pdf" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="mt-2 h-10 w-full rounded-md bg-[var(--acrobat-blue)] text-xs font-bold text-white hover:bg-[var(--acrobat-blue-hover)] disabled:opacity-50"
        >
          {busy
            ? "Working..."
            : toolId === "delete-pages"
              ? "Delete pages"
              : toolId === "extract-pages"
                ? "Extract pages"
                : toolId === "crop-pdf"
                  ? "Apply crop"
                  : toolId === "protect-pdf"
                    ? "Protect PDF"
                    : "Unlock PDF"}
        </button>
      ) : null}
    </>
  );
}
