import { useEffect, useRef, useState } from "react";
import { TpdfIcon, type TpdfIconName } from "./TpdfIcon";

export type MenuItemDef =
  | { kind: "action"; label: string; icon?: TpdfIconName; shortcut?: string; disabled?: boolean; title?: string; onClick: () => void }
  | { kind: "submenu"; label: string; icon?: TpdfIconName; disabled?: boolean; title?: string; items: MenuItemDef[] }
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
  triggerIcon?: TpdfIconName;
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
            data-tpdf-menu-item={item.label}
            className={
              "tpdf-menu-item " +
              (mobileSheet ? "tpdf-menu-item--mobile" : "tpdf-menu-item--desktop")
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
            <span className="tpdf-menu-item__lead">
              {item.icon ? <TpdfIcon name={item.icon} size={18} /> : <span className="tpdf-menu-item__icon-spacer" />}
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
      className={"tpdf-submenu-row" + (open ? " is-open" : "")}
      onMouseEnter={() => { if (!mobileSheet && !item.disabled) setOpen(true); }}
      onMouseLeave={() => { if (!mobileSheet) setOpen(false); }}
    >
      <button
        type="button"
        role="menuitem"
        data-tpdf-menu-item={item.label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={item.disabled}
        title={item.title}
        className={
          "tpdf-menu-item tpdf-menu-item--submenu " +
          (mobileSheet ? "tpdf-menu-item--mobile" : "tpdf-menu-item--desktop")
        }
        onClick={() => setOpen((value) => mobileSheet ? !value : true)}
      >
        <span className="tpdf-menu-item__lead">
          {item.icon ? <TpdfIcon name={item.icon} size={18} /> : <span className="tpdf-menu-item__icon-spacer" />}
          <span className="truncate whitespace-nowrap">{item.label}</span>
        </span>
        <TpdfIcon
          name={mobileSheet && open ? "chevron-down" : "chevron-right"}
          size={15}
          className="tpdf-menu-item__chevron"
        />
      </button>

      {open ? (
        <div
          role="menu"
          className={
            mobileSheet
              ? "tpdf-submenu-surface tpdf-submenu-surface--mobile"
              : "tpdf-submenu-surface tpdf-submenu-surface--desktop"
          }
          data-tpdf-menu-depth={depth + 1}
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
    <div className="relative" ref={ref} data-tpdf-menu={label}>
      <button
        data-tpdf-menu-trigger={label}
        className={"top-menu-btn tpdf-menu-trigger" + (isOpen ? " menu-open" : "")}
        onClick={onToggle}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={triggerTitle || label}
        title={triggerTitle}
      >
        {triggerIcon ? <TpdfIcon name={triggerIcon} size={20} /> : label}
      </button>
      {isOpen ? (
        <>
          {mobileSheet ? (
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
              style={{ zIndex: "calc(var(--z-dropdown) - 1)" }}
              onClick={onClose}
              aria-hidden="true"
            />
          ) : null}
          <div
            role="menu"
            data-tpdf-menu-surface={label}
            data-tpdf-mobile-sheet={mobileSheet ? "true" : "false"}
            className={
              mobileSheet
                ? "tpdf-menu-surface tpdf-menu-surface--mobile"
                : "tpdf-menu-surface tpdf-menu-surface--desktop"
            }
            style={{ zIndex: "var(--z-dropdown)" }}
          >
            <MenuItems items={items} mobileSheet={mobileSheet} onClose={onClose} />
          </div>
        </>
      ) : null}
    </div>
  );
}
