import { useEffect, useRef, useState } from "react";
import { OpdfIcon, type OpdfIconName } from "./OpdfIcon";

export type MenuItemDef =
  | { kind: "action"; label: string; icon?: OpdfIconName; shortcut?: string; disabled?: boolean; title?: string; onClick: () => void }
  | { kind: "submenu"; label: string; icon?: OpdfIconName; disabled?: boolean; title?: string; items: MenuItemDef[] }
  | { kind: "section"; label: string }
  | { kind: "separator" };

type MenuDropdownProps = {
  label: string;
  items: MenuItemDef[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  mobileSheet?: boolean;
  triggerTitle?: string;
  triggerIcon?: OpdfIconName;
};

function MenuItems({
  items,
  mobileSheet,
  onClose,
  depth = 0,
}: {
  items: MenuItemDef[];
  mobileSheet: boolean;
  onClose: () => void;
  depth?: number;
}) {
  return (
    <>
      {items.map((item, index) => {
        if (item.kind === "separator") {
          return <div key={index} className="my-1 h-px bg-[var(--ui-divider)]" />;
        }
        if (item.kind === "section") {
          return (
            <div
              key={index}
              className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]"
            >
              {item.label}
            </div>
          );
        }
        if (item.kind === "submenu") {
          return (
            <SubmenuItem
              key={item.label}
              item={item}
              mobileSheet={mobileSheet}
              onClose={onClose}
              depth={depth}
            />
          );
        }
        return (
          <button
            key={item.label}
            data-opdf-menu-item={item.label}
            className={
              "opdf-menu-item " +
              (mobileSheet ? "opdf-menu-item--mobile" : "opdf-menu-item--desktop")
            }
            disabled={item.disabled}
            title={item.title}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            type="button"
            role="menuitem"
          >
            <span className="opdf-menu-item__lead">
              {item.icon ? <OpdfIcon name={item.icon} size={18} /> : <span className="opdf-menu-item__icon-spacer" />}
              <span className="truncate whitespace-nowrap">{item.label}</span>
            </span>
            {!mobileSheet && item.shortcut ? (
              <span className="whitespace-nowrap text-[11px] text-[var(--text-secondary)]">{item.shortcut}</span>
            ) : null}
          </button>
        );
      })}
    </>
  );
}

function SubmenuItem({
  item,
  mobileSheet,
  onClose,
  depth,
}: {
  item: Extract<MenuItemDef, { kind: "submenu" }>;
  mobileSheet: boolean;
  onClose: () => void;
  depth: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={"opdf-submenu-row" + (open ? " is-open" : "")}
      onMouseEnter={() => { if (!mobileSheet && !item.disabled) setOpen(true); }}
      onMouseLeave={() => { if (!mobileSheet) setOpen(false); }}
    >
      <button
        type="button"
        role="menuitem"
        data-opdf-menu-item={item.label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={item.disabled}
        title={item.title}
        className={
          "opdf-menu-item opdf-menu-item--submenu " +
          (mobileSheet ? "opdf-menu-item--mobile" : "opdf-menu-item--desktop")
        }
        onClick={() => setOpen((value) => !value)}
      >
        <span className="opdf-menu-item__lead">
          {item.icon ? <OpdfIcon name={item.icon} size={18} /> : <span className="opdf-menu-item__icon-spacer" />}
          <span className="truncate whitespace-nowrap">{item.label}</span>
        </span>
        <OpdfIcon
          name={mobileSheet && open ? "chevron-down" : "chevron-right"}
          size={15}
          className="opdf-menu-item__chevron"
        />
      </button>

      {open ? (
        <div
          role="menu"
          className={
            mobileSheet
              ? "opdf-submenu-surface opdf-submenu-surface--mobile"
              : "opdf-submenu-surface opdf-submenu-surface--desktop"
          }
          data-opdf-menu-depth={depth + 1}
        >
          <MenuItems items={item.items} mobileSheet={mobileSheet} onClose={onClose} depth={depth + 1} />
        </div>
      ) : null}
    </div>
  );
}

export function MenuDropdown({
  label,
  items,
  isOpen,
  onToggle,
  onClose,
  mobileSheet = false,
  triggerTitle,
  triggerIcon,
}: MenuDropdownProps) {
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
      <button
        data-opdf-menu-trigger={label}
        className={"top-menu-btn opdf-menu-trigger" + (isOpen ? " menu-open" : "")}
        onClick={onToggle}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={triggerTitle || label}
        title={triggerTitle}
      >
        {triggerIcon ? <OpdfIcon name={triggerIcon} size={20} /> : label}
      </button>
      {isOpen ? (
        <div
          role="menu"
          data-opdf-menu-surface={label}
          data-opdf-mobile-sheet={mobileSheet ? "true" : "false"}
          className={
            mobileSheet
              ? "opdf-menu-surface opdf-menu-surface--mobile"
              : "opdf-menu-surface opdf-menu-surface--desktop"
          }
          style={{ zIndex: "var(--z-dropdown)" }}
        >
          <MenuItems items={items} mobileSheet={mobileSheet} onClose={onClose} />
        </div>
      ) : null}
    </div>
  );
}
