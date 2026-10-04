import { useEffect, useMemo, useState } from "react";
import { pdfSourceToBytes, type PdfSource } from "../lib/documentSource";
import {
  addInternalPageLink,
  addPdfBookmarks,
  addUriLink,
  fillFormFields,
  inspectFormFields,
  type FormFieldDescriptor,
  type FormFieldValue,
  type PdfBookmarkInput,
} from "../lib/pdfAdvanced";
import { useDialogClose } from "../hooks/useDialogClose";

type Tab = "forms" | "bookmarks" | "links";

export function AdvancedPdfModal({
  isOpen,
  onClose,
  source,
  totalPages,
  currentPage,
  initialBookmarks,
  onApplied,
}: {
  isOpen: boolean;
  onClose: () => void;
  source: PdfSource;
  totalPages: number;
  currentPage: number;
  initialBookmarks: Array<{ title: string; page: number; parent?: number }>;
  onApplied: (bytes: Uint8Array, message: string, bookmarks?: PdfBookmarkInput[]) => void;
}) {
  useDialogClose(isOpen, onClose);
  const [tab, setTab] = useState<Tab>("forms");
  const [fields, setFields] = useState<FormFieldDescriptor[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, FormFieldValue>>({});
  const [flatten, setFlatten] = useState(false);
  const [bookmarks, setBookmarks] = useState<PdfBookmarkInput[]>([]);
  const [linkMode, setLinkMode] = useState<"external" | "internal">("external");
  const [linkPage, setLinkPage] = useState(currentPage);
  const [destinationPage, setDestinationPage] = useState(Math.min(totalPages, currentPage + 1));
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkRect, setLinkRect] = useState({ x: 10, y: 10, width: 30, height: 8 });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLinkPage(currentPage);
    setDestinationPage(Math.min(Math.max(1, totalPages), currentPage < totalPages ? currentPage + 1 : currentPage));
    setBookmarks(
      initialBookmarks.length
        ? initialBookmarks.map((item) => ({ title: item.title, page: item.page, parent: item.parent }))
        : [{ title: "Page " + currentPage, page: currentPage }],
    );
    setStatus("");
    setError(null);
  }, [isOpen, currentPage, initialBookmarks, totalPages]);

  useEffect(() => {
    if (!isOpen || tab !== "forms" || !source) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    void pdfSourceToBytes(source)
      .then((bytes) => inspectFormFields(bytes))
      .then((nextFields) => {
        if (cancelled) return;
        setFields(nextFields);
        const nextValues: Record<string, FormFieldValue> = {};
        nextFields.forEach((field) => { nextValues[field.name] = field.value; });
        setFieldValues(nextValues);
        setStatus(nextFields.length ? nextFields.length + " form field(s) detected" : "No AcroForm fields found");
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not inspect form");
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [isOpen, tab, source]);

  const validBookmarks = useMemo(
    () => bookmarks.filter((item) => item.title.trim() && item.page >= 1 && item.page <= totalPages),
    [bookmarks, totalPages],
  );

  const applyForms = async () => {
    setBusy(true);
    setError(null);
    try {
      const bytes = await fillFormFields(await pdfSourceToBytes(source), fieldValues, flatten);
      onApplied(bytes, flatten ? "Form values applied and flattened." : "Form values applied.");
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not fill form");
    } finally {
      setBusy(false);
    }
  };

  const applyBookmarks = async () => {
    setBusy(true);
    setError(null);
    try {
      const bytes = await addPdfBookmarks(await pdfSourceToBytes(source), validBookmarks);
      onApplied(bytes, validBookmarks.length + " PDF bookmark(s) embedded.", validBookmarks);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add bookmarks");
    } finally {
      setBusy(false);
    }
  };

  const applyLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const common = {
        page: linkPage,
        x: linkRect.x / 100,
        y: linkRect.y / 100,
        width: linkRect.width / 100,
        height: linkRect.height / 100,
      };
      const bytes = linkMode === "internal"
        ? await addInternalPageLink(await pdfSourceToBytes(source), { ...common, destinationPage })
        : await addUriLink(await pdfSourceToBytes(source), { ...common, url: linkUrl });
      onApplied(
        bytes,
        linkMode === "internal"
          ? "Internal link from page " + linkPage + " to page " + destinationPage + " embedded."
          : "Hyperlink embedded on page " + linkPage + ".",
      );
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add hyperlink");
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div data-opdf-dialog="advanced-pdf" className="fixed inset-0 flex items-center justify-center bg-black/55 p-4" style={{ zIndex: "var(--z-modal-high)" }}>
      <div className="premium-modal flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden">
        <div className="premium-modal-header">
          <div className="premium-modal-title">Advanced PDF</div>
          <button data-opdf-action="close-dialog" type="button" className="rounded px-2 py-1 text-sm hover:bg-[var(--ui-hover-bg)]" onClick={onClose}>✕</button>
        </div>

        <div className="flex border-b border-[var(--border-color)] px-4 pt-2">
          {(["forms", "bookmarks", "links"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={"border-b-2 px-4 py-2 text-sm font-semibold capitalize " + (tab === item ? "border-[var(--acrobat-blue)] text-[var(--acrobat-blue)]" : "border-transparent text-[var(--text-secondary)]")}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="premium-modal-body min-h-0 overflow-auto">
          {error ? <div className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">{error}</div> : null}
          {status ? <div className="mb-3 text-xs text-[var(--text-secondary)]">{status}</div> : null}

          {tab === "forms" ? (
            <div>
              {busy && fields.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">Reading AcroForm…</p> : null}
              {fields.length === 0 && !busy ? (
                <div className="rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] p-4 text-sm text-[var(--text-secondary)]">
                  This PDF has no AcroForm fields. XFA forms are not supported by this tool.
                </div>
              ) : (
                <div className="space-y-3">
                  {fields.map((field) => (
                    <label key={field.name} className="block rounded border border-[var(--border-color)] p-3">
                      <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                        <span>{field.name}</span>
                        <span className="rounded bg-[var(--ui-muted-bg)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">{field.type}</span>
                      </div>
                      {field.type === "checkbox" ? (
                        <input
                          type="checkbox"
                          checked={Boolean(fieldValues[field.name])}
                          onChange={(event) => setFieldValues((current) => ({ ...current, [field.name]: event.target.checked }))}
                        />
                      ) : field.type === "dropdown" || field.type === "radio" ? (
                        <select
                          value={String(fieldValues[field.name] ?? "")}
                          onChange={(event) => setFieldValues((current) => ({ ...current, [field.name]: event.target.value }))}
                          className="w-full rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-2 py-2 text-sm"
                        >
                          <option value="">Select…</option>
                          {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : field.type === "option-list" ? (
                        <select
                          multiple
                          value={Array.isArray(fieldValues[field.name]) ? fieldValues[field.name] as string[] : []}
                          onChange={(event) => setFieldValues((current) => ({
                            ...current,
                            [field.name]: Array.from(event.currentTarget.selectedOptions).map((option) => option.value),
                          }))}
                          className="w-full rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-2 py-2 text-sm"
                        >
                          {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : field.type === "unsupported" ? (
                        <div className="text-xs text-[var(--text-secondary)]">Unsupported field type; value is left unchanged.</div>
                      ) : (
                        <input
                          value={String(fieldValues[field.name] ?? "")}
                          onChange={(event) => setFieldValues((current) => ({ ...current, [field.name]: event.target.value }))}
                          className="w-full rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-2 py-2 text-sm"
                        />
                      )}
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <input type="checkbox" checked={flatten} onChange={(event) => setFlatten(event.target.checked)} />
                    Flatten fields after filling (values become non-editable)
                  </label>
                </div>
              )}
            </div>
          ) : null}

          {tab === "bookmarks" ? (
            <div>
              <div className="mb-3 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
                These are real PDF outline bookmarks. Choose a previous bookmark as Parent to create a hierarchy.
              </div>
              <div className="space-y-2">
                {bookmarks.map((bookmark, index) => (
                  <div key={index} className="grid grid-cols-[minmax(0,1fr)_80px_150px_auto] items-center gap-2">
                    <input
                      value={bookmark.title}
                      onChange={(event) => setBookmarks((current) => current.map((item, i) => i === index ? { ...item, title: event.target.value } : item))}
                      placeholder="Bookmark title"
                      className="min-w-0 rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-2 py-2 text-sm"
                    />
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, totalPages)}
                      value={bookmark.page}
                      onChange={(event) => setBookmarks((current) => current.map((item, i) => i === index ? { ...item, page: Number(event.target.value) || 1 } : item))}
                      className="rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-2 py-2 text-sm"
                      title="Page"
                    />
                    <select
                      value={bookmark.parent ?? ""}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setBookmarks((current) => current.map((item, i) => i === index
                          ? { ...item, parent: raw === "" ? undefined : Number(raw) }
                          : item));
                      }}
                      className="rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-2 py-2 text-xs"
                      title="Parent bookmark"
                    >
                      <option value="">Top level</option>
                      {bookmarks.slice(0, index).map((candidate, parentIndex) => (
                        <option key={parentIndex} value={parentIndex}>{candidate.title || "Bookmark " + (parentIndex + 1)}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setBookmarks((current) => current
                        .filter((_, i) => i !== index)
                        .map((item) => ({
                          ...item,
                          parent: item.parent === index
                            ? undefined
                            : typeof item.parent === "number" && item.parent > index
                              ? item.parent - 1
                              : item.parent,
                        })))}
                      className="rounded border border-red-200 px-2 py-2 text-xs text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setBookmarks((current) => [...current, { title: "Page " + currentPage, page: currentPage }])}
                className="mt-3 rounded border border-[var(--border-color)] px-3 py-2 text-xs font-semibold"
              >
                + Add bookmark
              </button>
            </div>
          ) : null}

          {tab === "links" ? (
            <div className="space-y-3">
              <div className="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
                Coordinates are percentages of the page, measured from the top-left. The link area itself is invisible in the exported PDF.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold">Link type
                  <select value={linkMode} onChange={(event) => setLinkMode(event.target.value as "external" | "internal")} className="mt-1 w-full rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-3 py-2 text-sm font-normal">
                    <option value="external">External URL</option>
                    <option value="internal">Internal page</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold">Source page
                  <input type="number" min={1} max={Math.max(1, totalPages)} value={linkPage} onChange={(event) => setLinkPage(Number(event.target.value) || 1)} className="mt-1 w-full rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-3 py-2 text-sm font-normal" />
                </label>
              </div>
              {linkMode === "external" ? (
                <label className="block text-xs font-semibold">URL
                  <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} className="mt-1 w-full rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-3 py-2 text-sm font-normal" />
                </label>
              ) : (
                <label className="block text-xs font-semibold">Destination page
                  <input type="number" min={1} max={Math.max(1, totalPages)} value={destinationPage} onChange={(event) => setDestinationPage(Number(event.target.value) || 1)} className="mt-1 w-32 rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-3 py-2 text-sm font-normal" />
                </label>
              )}
              <div className="grid grid-cols-4 gap-2">
                {(["x", "y", "width", "height"] as const).map((key) => (
                  <label key={key} className="text-xs font-semibold capitalize">{key} %
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={linkRect[key]}
                      onChange={(event) => setLinkRect((current) => ({ ...current, [key]: Number(event.target.value) || 0 }))}
                      className="mt-1 w-full rounded border border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-2 py-2 text-sm font-normal"
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="premium-modal-footer">
          <button data-opdf-action="close-dialog" type="button" onClick={onClose} className="rounded border border-[var(--border-color)] px-4 py-2 text-sm">Cancel</button>
          {tab === "forms" ? (
            <button type="button" disabled={busy || fields.length === 0} onClick={() => void applyForms()} className="rounded bg-[var(--acrobat-blue)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Apply form values</button>
          ) : tab === "bookmarks" ? (
            <button type="button" disabled={busy || validBookmarks.length === 0} onClick={() => void applyBookmarks()} className="rounded bg-[var(--acrobat-blue)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Embed bookmarks</button>
          ) : (
            <button type="button" disabled={busy || (linkMode === "external" && !linkUrl.trim())} onClick={() => void applyLink()} className="rounded bg-[var(--acrobat-blue)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{linkMode === "internal" ? "Add internal link" : "Add hyperlink"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
