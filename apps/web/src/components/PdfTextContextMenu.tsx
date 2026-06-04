import { createPortal } from "react-dom";
import type { TextSelectionAction } from "./PdfTextSelection.types";

export function ContextMenu({
  menu,
  onAction,
}: {
  menu: { x: number; y: number };
  onAction: (action: TextSelectionAction) => void;
}) {
  return createPortal(
    <div
      className="fixed z-[9999] bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-xl shadow-2xl p-1.5 min-w-[170px] flex flex-col gap-0.5 transition-all duration-150 animate-in fade-in slide-in-from-top-1 pointer-events-auto"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuButton icon="📋" label="Copy Text" onClick={() => onAction("copy")} />
      <MenuButton icon="📝" label="Edit Text (Che & Sửa)" onClick={() => onAction("edit-text")} />
      <MenuButton icon="🤖" label="AI Rewrite (Viết lại)" onClick={() => onAction("ai-rewrite")} />
      <MenuButton icon="🗣️" label="AI Translate (Dịch)" onClick={() => onAction("translate")} />
      <div className="h-px bg-slate-100 my-1" />
      <MenuButton icon="🟨" label="Highlight" onClick={() => onAction("highlight")} />
      <MenuButton icon="➖" label="Underline" onClick={() => onAction("underline")} />
      <MenuButton icon="⨉" label="Strikethrough" onClick={() => onAction("strike")} />
      <MenuButton icon="🧽" label="Erase Text (Xóa chữ)" onClick={() => onAction("redact")} danger />
    </div>,
    document.body,
  );
}

function MenuButton({
  icon, label, onClick, danger,
}: {
  icon: string; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer text-left w-full ${
        danger
          ? "text-red-650 hover:bg-red-50"
          : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      {icon} {label}
    </button>
  );
}
