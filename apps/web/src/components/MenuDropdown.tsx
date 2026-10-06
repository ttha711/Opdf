import { useEffect, useRef } from "react";

export type MenuItemDef =
  | { kind: "action"; label: string; shortcut?: string; disabled?: boolean; title?: string; onClick: () => void }
  | { kind: "section"; label: string }
  | { kind: "separator" };

type MenuDropdownProps = {
  label: string;
  items: MenuItemDef[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  mobileSheet?: boolean;
};

export function MenuDropdown({ label, items, isOpen, onToggle, onClose, mobileSheet = false }: MenuDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function pointerHandler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function keyHandler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", pointerHandler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", pointerHandler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [isOpen, onClose]);

  return (
    <div className="relative" ref={ref} data-opdf-menu={label}>
      <button data-opdf-menu-trigger={label} className={`top-menu-btn${isOpen ? " menu-open" : ""}`} onClick={onToggle} type="button" aria-haspopup="menu" aria-expanded={isOpen}>
        {label}
      </button>
      {isOpen && (
        <div
          role="menu"
          data-opdf-menu-surface={label}
          data-opdf-mobile-sheet={mobileSheet ? "true" : "false"}
          className={mobileSheet
            ? "fixed inset-x-3 bottom-3 top-auto max-h-[72vh] min-w-0 overflow-y-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-toolbar)] py-2 shadow-2xl"
            : "absolute left-0 top-[calc(100%+2px)] max-h-[calc(100vh-56px)] min-w-[220px] overflow-y-auto rounded border border-[var(--border-color)] bg-[var(--bg-toolbar)] py-1 shadow-xl"}
          style={{ zIndex: "var(--z-dropdown)" }}
        >
          {items.map((item, i) =>
            item.kind === "separator" ? (
              <div key={i} className="my-1 h-px bg-[var(--ui-divider)]" />
            ) : item.kind === "section" ? (
              <div key={i} className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                {item.label}
              </div>
            ) : (
              <button
                key={i}
                data-opdf-menu-item={item.label}
                className={mobileSheet
                  ? "flex min-h-12 w-full items-center justify-between gap-3 border-none bg-transparent px-4 py-3 text-left text-[15px] text-[var(--text-primary)] transition-colors active:bg-[var(--ui-accent-bg)] disabled:cursor-default disabled:opacity-40"
                  : "flex w-full items-center justify-between gap-6 border-none bg-transparent px-4 py-[7px] text-left text-[13px] text-[var(--text-primary)] transition-colors hover:bg-[var(--ui-accent-bg)] hover:text-[var(--acrobat-blue)] disabled:cursor-default disabled:opacity-40"}
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                  item.onClick();
                  onClose();
                }}
                type="button"
                role="menuitem"
              >
                <span className="flex-1 whitespace-nowrap">{item.label}</span>
                {!mobileSheet && item.shortcut ? <span className="whitespace-nowrap text-[11px] text-[var(--text-secondary)]">{item.shortcut}</span> : null}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
