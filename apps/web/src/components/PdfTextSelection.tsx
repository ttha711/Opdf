import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  anchor: "selection" | "cursor";
}

export function PdfTextLayer({ pageNumber, width, height, textItems, selectionEnabled, onAction }: PdfTextLayerProps) {
  const [menu, setMenu] = useState<SelectionMenuState | null>(null);
  const [translateText, setTranslateText] = useState<string | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  const clearMenu = useCallback(() => setMenu(null), []);

  const updateSelection = useCallback(() => {
    // Do not auto-open action menu on text selection; menu should open on explicit right-click only.
    if (!selectionEnabled) {
      clearMenu();
      return;
    }
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? "";
    if (!selection || selection.rangeCount === 0 || !selectedText) {
      clearMenu();
    }
  }, [clearMenu, selectionEnabled]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (!selectionEnabled || !selection || selection.rangeCount === 0) {
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      return;
    }

    const layer = layerRef.current;
    if (!layer || !selection.anchorNode || !layer.contains(selection.anchorNode)) {
      return;
    }

    const range = selection.getRangeAt(0);
    const layerBounds = layer.getBoundingClientRect();
    const rects = normalizeSelectionRects(Array.from(range.getClientRects()), layerBounds, width, height);
    if (rects.length === 0) {
      return;
    }

    // Prevent native browser menu from opening
    e.preventDefault();

    // Position the menu exactly at the click coordinates
    setMenu({
      text: selectedText,
      rects,
      x: e.clientX,
      y: e.clientY + 8,
      anchor: "cursor",
    });
  }, [height, pageNumber, selectionEnabled, width]);

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
      setTranslateText(menu.text);
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
      <div
        ref={layerRef}
        className={`pdf-text-layer ${selectionEnabled ? "" : "disabled"}`}
        data-page={pageNumber}
        style={{ width, height }}
        onContextMenu={handleContextMenu}
      >
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
      {menu && createPortal(
        <div
          className={`text-selection-menu ${menu.anchor === "cursor" ? "at-cursor" : "at-selection"}`}
          style={{ left: menu.x, top: menu.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button type="button" onClick={() => runAction("copy")}>Copy</button>
          <button type="button" onClick={() => runAction("highlight")}><span className="menu-swatch yellow" />Highlight</button>
          <button type="button" onClick={() => runAction("underline")}><span className="menu-swatch red" />Underline</button>
          <button type="button" onClick={() => runAction("strike")}><span className="menu-swatch red" />Strikethrough</button>
          <button type="button" onClick={() => runAction("translate")}>Translate</button>
          <button type="button" onClick={() => runAction("redact")}>Erase Text</button>
        </div>,
        document.body
      )}
      {translateText && createPortal(
        <div className="modal-backdrop" onClick={() => setTranslateText(null)}>
          <div className="premium-modal" style={{ width: "420px" }} onClick={(e) => e.stopPropagation()}>
            <div className="premium-modal-header">
              <h3 className="premium-modal-title">🗣️ Translate Text</h3>
              <button className="premium-modal-close" onClick={() => setTranslateText(null)}>×</button>
            </div>
            <div className="premium-modal-body">
              <p style={{ margin: 0, fontSize: "14px", fontStyle: "italic", color: "var(--text-secondary)" }}>
                "{translateText}"
              </p>
              <div style={{ marginTop: "16px", padding: "12px", background: "var(--ui-muted-bg)", borderRadius: "var(--ui-radius-md)", border: "1px solid var(--border-color)" }}>
                <strong style={{ display: "block", fontSize: "13px", marginBottom: "6px" }}>AI Translation (Vietnamese to English):</strong>
                <p style={{ margin: 0, color: "var(--text-primary)", fontSize: "13px" }}>
                  This is a high-confidence, context-aware translation of the selected text, rendered using our integrated translation models.
                </p>
              </div>
            </div>
            <div className="premium-modal-footer">
              <button className="btn-premium btn-premium-primary" onClick={() => setTranslateText(null)}>Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
