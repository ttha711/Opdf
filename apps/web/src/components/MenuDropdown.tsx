import { useEffect, useRef } from "react";

export type MenuItemDef =
  | { kind: "action"; label: string; shortcut?: string; disabled?: boolean; onClick: () => void }
  | { kind: "separator" };

type MenuDropdownProps = {
  label: string;
  items: MenuItemDef[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
};

export function MenuDropdown({ label, items, isOpen, onToggle, onClose }: MenuDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onClose]);

  return (
    <div className="relative" ref={ref}>
      <button className={`top-menu-btn${isOpen ? " menu-open" : ""}`} onClick={onToggle} type="button">
        {label}
      </button>
      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+2px)] z-[200] min-w-[220px] rounded border border-[#c8c8c8] bg-white py-1 shadow-lg">
          {items.map((item, i) =>
            item.kind === "separator" ? (
              <div key={i} className="my-1 h-px bg-gray-200" />
            ) : (
              <button
                key={i}
                className="flex w-full items-center justify-between gap-6 border-none bg-transparent px-4 py-[7px] text-left text-[13px] text-[var(--text-primary)] transition-colors hover:bg-[#e8f0fe] hover:text-[var(--acrobat-blue)] disabled:cursor-default disabled:text-[#b0b0b0]"
                disabled={item.disabled}
                onClick={() => {
                  item.onClick();
                  onClose();
                }}
                type="button"
              >
                <span className="flex-1 whitespace-nowrap">{item.label}</span>
                {item.shortcut && <span className="whitespace-nowrap text-[11px] text-[#8a8a8a]">{item.shortcut}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
