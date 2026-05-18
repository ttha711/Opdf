import { useCallback, useEffect, useState } from "react";
import type { RenderedTextItem } from "./PdfViewer.types";
import { normalizeSelectionRects } from "./PdfTextSelection.utils";

type TextSelectionAction = "copy" | "highlight" | "underline" | "strike" | "translate" | "redact";

interface PdfTextLayerProps {
  pageNumber: number;
  width: number;
  height: number;
  textItems: RenderedTextItem[];
  selectionEnabled: boolean;
  onAction: (pageNumber: number, kind: string, rect: { x: number; y: number; width: number; height: number }) => void;
}

interface SelectionMenuState {
  text: string;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  x: number;
  y: number;
}

export function PdfTextLayer({ pageNumber, width, height, textItems, selectionEnabled, onAction }: PdfTextLayerProps) {
  const [menu, setMenu] = useState<SelectionMenuState | null>(null);

  const clearMenu = useCallback(() => setMenu(null), []);

  const updateSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selectionEnabled) {
      clearMenu();
      return;
    }
    const selectedText = selection?.toString().trim() ?? "";
    if (!selection || selection.rangeCount === 0 || !selectedText) {
      clearMenu();
      return;
    }

    const layer = document.querySelector<HTMLElement>(`.pdf-text-layer[data-page="${pageNumber}"]`);
    if (!layer || !selection.anchorNode || !layer.contains(selection.anchorNode)) {
      clearMenu();
      return;
    }

    const range = selection.getRangeAt(0);
    const layerBounds = layer.getBoundingClientRect();
    const rects = normalizeSelectionRects(Array.from(range.getClientRects()), layerBounds, width, height);
    if (rects.length === 0) {
      clearMenu();
      return;
    }

    const first = range.getBoundingClientRect();
    setMenu({
      text: selectedText,
      rects,
      x: first.left + first.width / 2,
      y: Math.max(8, first.top - 12),
    });
  }, [clearMenu, height, pageNumber, selectionEnabled, width]);

  useEffect(() => {
    document.addEventListener("selectionchange", updateSelection);
    window.addEventListener("scroll", clearMenu, true);
    window.addEventListener("resize", clearMenu);
    return () => {
      document.removeEventListener("selectionchange", updateSelection);
      window.removeEventListener("scroll", clearMenu, true);
      window.removeEventListener("resize", clearMenu);
    };
  }, [clearMenu, updateSelection]);

  const runAction = async (action: TextSelectionAction) => {
    if (!menu) return;
    if (action === "copy") {
      await navigator.clipboard?.writeText(menu.text);
      clearMenu();
      return;
    }
    if (action === "translate") {
      window.alert(`Translate: ${menu.text}`);
      clearMenu();
      return;
    }

    const kind = action === "redact" ? "redact" : action;
    menu.rects.forEach((rect) => onAction(pageNumber, kind, rect));
    window.getSelection()?.removeAllRanges();
    clearMenu();
  };

  return (
    <>
      <div className={`pdf-text-layer ${selectionEnabled ? "" : "disabled"}`} data-page={pageNumber} style={{ width, height }} onMouseUp={updateSelection}>
        {textItems.map((item, index) => (
          <span
            key={`${index}-${item.left}-${item.top}`}
            style={{
              left: item.left,
              top: item.top,
              width: item.width,
              height: item.height,
              fontSize: item.fontSize,
              transform: item.transform,
            }}
          >
            {item.str}
          </span>
        ))}
      </div>
      {menu && (
        <div className="text-selection-menu" style={{ left: menu.x, top: menu.y }}>
          <button type="button" onClick={() => runAction("copy")}>Copy</button>
          <button type="button" onClick={() => runAction("highlight")}><span className="menu-swatch yellow" />Highlight</button>
          <button type="button" onClick={() => runAction("underline")}><span className="menu-swatch red" />Underline</button>
          <button type="button" onClick={() => runAction("strike")}><span className="menu-swatch red" />Strikethrough</button>
          <button type="button" onClick={() => runAction("translate")}>Translate</button>
          <button type="button" onClick={() => runAction("redact")}>Erase Text</button>
        </div>
      )}
    </>
  );
}
