import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { commitPendingNativeInlineEdit } from "../lib/nativeEditRuntime";
import {
  filterPaletteCommands, paletteUnavailableReason, PALETTE_COMMANDS,
  type PaletteCommand,
} from "../lib/commandPalette";
import { TpdfIcon } from "./TpdfIcon";
import { toast } from "./ToastProvider";

type Props = {
  hasDocument: boolean;
  isPublic: boolean;
  onOpenFile: () => void;
  onNavigate: () => void;
};

function isTypingTarget(target: EventTarget | null) {
  return target instanceof Element &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
}

export function CommandPalette({ hasDocument, isPublic, onOpenFile, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const matches = useMemo(() => filterPaletteCommands(PALETTE_COMMANDS, query).slice(0, 35), [query]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => openerRef.current?.focus());
  };
  const launch = () => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  };

  useEffect(() => {
    const trigger = () => { if (!open) launch(); else close(); };
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        if (!open && isTypingTarget(event.target)) return;
        event.preventDefault();
        trigger();
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("tpdf:open-command-palette", trigger);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("tpdf:open-command-palette", trigger);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const execute = async (command: PaletteCommand) => {
    if (paletteUnavailableReason(command, hasDocument, isPublic)) return;
    close();
    try {
      if (command.id === "open") return onOpenFile();
      const agent = window.tpdfAgent;
      if (!agent) throw new Error("PDF tools are not ready yet.");
      // Switching panels must commit any pending inline edit first.
      if (command.tool === "open-tool-panel" || command.tool === "open-tools-dashboard") {
        await commitPendingNativeInlineEdit();
        const selected = await agent.execute({ tool: "select-tool" });
        if (selected.status === "failed") throw new Error(selected.message);
      }
      onNavigate();
      const result = await agent.execute({
        tool: command.tool,
        ...(command.toolId ? { args: { toolId: command.toolId } } : {}),
      });
      if (result.status === "failed" || result.status === "unavailable") toast.error(result.message);
      else if (result.status === "input_required" || result.status === "confirmation_required") toast.info(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open that tool.");
    }
  };

  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(i => (i + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % (matches.length || 1));
    } else if (event.key === "Enter" && event.target === inputRef.current) {
      event.preventDefault();
      const command = matches[activeIndex];
      if (command) void execute(command);
    } else if (event.key === "Tab") {
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>("input:not(:disabled),button:not(:disabled)");
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };

  if (!open) return null;
  return (
    <div data-tpdf-command-palette="open" className="fixed inset-0 z-[9999] flex items-start justify-center px-3 pt-[min(14vh,110px)]">
      <button type="button" tabIndex={-1} aria-label="Dismiss command search"
        className="absolute inset-0 h-full w-full cursor-default bg-black/55"
        onClick={close} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="tpdf-command-heading"
        onKeyDown={handleKeys}
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[var(--border-color)] p-4">
          <TpdfIcon name="search" size={20} />
          <div className="min-w-0 flex-1">
            <label id="tpdf-command-heading" className="sr-only">Find a command</label>
            <input ref={inputRef} value={query}
              onChange={event => { setQuery(event.target.value); setActiveIndex(0); }}
              role="combobox" aria-expanded="true" aria-autocomplete="list"
              aria-controls="tpdf-command-results"
              aria-activedescendant={matches[activeIndex] ? "tpdf-command-" + matches[activeIndex].id : undefined}
              aria-label="Find a command"
              placeholder="Search actions, tools or tasks…"
              className="w-full border-none bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]" />
          </div>
          <button type="button" onClick={close} aria-label="Close command search"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--border-color)] px-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <span className="hidden sm:inline">Esc</span>
            <span className="sm:hidden text-base leading-none">✕</span>
          </button>
        </div>
        <div id="tpdf-command-results" role="listbox" aria-label="Available commands"
          className="max-h-[min(55vh,440px)] overflow-y-auto p-2">
          {matches.length === 0 ? (
            <p className="p-5 text-center text-sm text-[var(--text-secondary)]">No matching commands. Try “page” or “edit”.</p>
          ) : matches.map((command, index) => {
            const reason = paletteUnavailableReason(command, hasDocument, isPublic);
            return (
              <button id={"tpdf-command-" + command.id} key={command.id} type="button"
                role="option" aria-selected={index === activeIndex}
                data-tpdf-command={command.id} disabled={Boolean(reason)} title={reason || command.title}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void execute(command)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${index === activeIndex ? "bg-[var(--ui-hover-bg)]" : ""} ${reason ? "cursor-not-allowed opacity-45" : "hover:bg-[var(--ui-hover-bg)]"}`}>
                <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--ui-muted-bg)]">
                  <TpdfIcon name={command.icon} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{command.title}</span>
                  <span className="block truncate text-[11px] text-[var(--text-secondary)]">{reason || command.group}</span>
                </span>
                {!reason && <TpdfIcon name="chevron-right" size={16} />}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between border-t border-[var(--border-color)] bg-[var(--ui-muted-bg)] px-4 py-2 text-[11px] text-[var(--text-secondary)]">
          <span className="hidden sm:inline">↑ ↓ Navigate · Enter Run · Esc Close</span>
          <span className="sm:hidden">Tap any action to run</span>
          <span>{matches.length} commands</span>
        </div>
      </div>
    </div>
  );
}
