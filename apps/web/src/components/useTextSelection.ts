import { useCallback, useEffect, useRef, useState } from "react";
import type { RenderedTextItem } from "./PdfViewer.types";
import type { SelectionMenuState } from "./PdfTextSelection.types";
import { joinMatchedItems, matchTextItemsToRects, normalizeSelectionRects } from "./PdfTextSelection.utils";

export function useTextSelection(
  selectionEnabled: boolean,
  width: number,
  height: number,
  textItems: RenderedTextItem[]
) {
  const [menu, setMenu] = useState<SelectionMenuState | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const clearMenu = useCallback(() => setMenu(null), []);

  const setSelectingFlag = useCallback((active: boolean) => {
    if (typeof document === "undefined") return;
    if (active) {
      document.body.dataset.opdfSelecting = "1";
    } else {
      delete document.body.dataset.opdfSelecting;
    }
  }, []);

  const isInteractiveDescendant = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("button, input, textarea, select, a, [role='button']"));
  };

  const updateSelection = useCallback(() => {
    if (!selectionEnabled) {
      clearMenu();
      setSelectingFlag(false);
      return;
    }
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? "";
    if (!selection || selection.rangeCount === 0 || !selectedText) {
      clearMenu();
      setSelectingFlag(false);
    }
  }, [clearMenu, selectionEnabled, setSelectingFlag]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectionEnabled || e.button !== 0 || isInteractiveDescendant(e.target)) {
      dragStartRef.current = null;
      return;
    }
    const layer = layerRef.current;
    if (!layer || !layer.contains(e.target as Node)) {
      dragStartRef.current = null;
      return;
    }
    setSelectingFlag(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  }, [selectionEnabled, setSelectingFlag]);

  const handleMouseUp = useCallback((_e: MouseEvent) => {
    dragStartRef.current = null;
    setSelectingFlag(false);
  }, [setSelectingFlag]);

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
    const matchedItems = findMatchedItems(rects);
    const reconstructedText = joinMatchedItems(matchedItems);

    e.preventDefault();

    setMenu({
      text: reconstructedText || selectedText,
      rects,
      x: e.clientX,
      y: e.clientY + 8,
      anchor: "cursor",
    });
  }, [height, selectionEnabled, width]);

  useEffect(() => {
    document.addEventListener("selectionchange", updateSelection);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("scroll", clearMenu, true);
    window.addEventListener("resize", clearMenu);
    return () => {
      document.removeEventListener("selectionchange", updateSelection);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("scroll", clearMenu, true);
      window.removeEventListener("resize", clearMenu);
    };
  }, [clearMenu, handleMouseUp, updateSelection]);

  const findMatchedItems = (rects: Array<{ x: number; y: number; width: number; height: number }>) => {
    return matchTextItemsToRects(textItems, rects, width, height);
  };

  return { menu, clearMenu, layerRef, handleContextMenu, handleMouseDown, findMatchedItems };
}
