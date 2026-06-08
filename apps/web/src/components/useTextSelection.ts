import { useCallback, useEffect, useRef, useState } from "react";
import type { RenderedTextItem } from "./PdfViewer.types";
import type { SelectionMenuState } from "./PdfTextSelection.types";
import { buildSelectionFromDragBounds, joinMatchedItems, matchTextItemsToRects, normalizeSelectionRects } from "./PdfTextSelection.utils";

export function useTextSelection(
  selectionEnabled: boolean,
  width: number,
  height: number,
  textItems: RenderedTextItem[]
) {
  const [menu, setMenu] = useState<SelectionMenuState | null>(null);
  const [selectionRects, setSelectionRects] = useState<Array<{ x: number; y: number; width: number; height: number }>>([]);
  const [selectionText, setSelectionText] = useState("");
  const layerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const releaseSelectingTimerRef = useRef<number | null>(null);

  const clearMenu = useCallback(() => setMenu(null), []);
  const clearSelection = useCallback(() => {
    setSelectionRects([]);
    setSelectionText("");
  }, []);

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
      clearSelection();
      setSelectingFlag(false);
      return;
    }
    if (dragStartRef.current) {
      return;
    }
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? "";
    if (!selection || selection.rangeCount === 0 || !selectedText) {
      clearMenu();
      setSelectingFlag(false);
    }
  }, [clearMenu, clearSelection, selectionEnabled, setSelectingFlag]);

  const buildDragRect = useCallback((start: { x: number; y: number }, current: { x: number; y: number }) => {
    const left = Math.min(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const right = Math.max(start.x, current.x);
    const bottom = Math.max(start.y, current.y);
    return {
      x: left / width,
      y: top / height,
      width: Math.max(0, right - left) / width,
      height: Math.max(0, bottom - top) / height,
    };
  }, [height, width]);

  const updateCustomSelection = useCallback((clientX: number, clientY: number) => {
    const layer = layerRef.current;
    const dragStart = dragStartRef.current;
    if (!layer || !dragStart) return null;

    const bounds = layer.getBoundingClientRect();
    const current = {
      x: clamp(clientX - bounds.left, 0, width),
      y: clamp(clientY - bounds.top, 0, height),
    };

    const distance = Math.hypot(current.x - dragStart.x, current.y - dragStart.y);
    if (distance < 4) {
      clearSelection();
      return null;
    }

    const selection = buildSelectionFromDragBounds(textItems, buildDragRect(dragStart, current), width, height);
    setSelectionRects(selection.rects);
    setSelectionText(selection.text);
    return selection;
  }, [buildDragRect, clearSelection, height, textItems, width]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (releaseSelectingTimerRef.current !== null) {
      window.clearTimeout(releaseSelectingTimerRef.current);
      releaseSelectingTimerRef.current = null;
    }
    if (!selectionEnabled || e.button !== 0 || isInteractiveDescendant(e.target)) {
      dragStartRef.current = null;
      return;
    }
    const layer = layerRef.current;
    if (!layer || !layer.contains(e.target as Node)) {
      dragStartRef.current = null;
      return;
    }
    const bounds = layer.getBoundingClientRect();
    window.getSelection()?.removeAllRanges();
    clearMenu();
    clearSelection();
    setSelectingFlag(true);
    dragStartRef.current = {
      x: clamp(e.clientX - bounds.left, 0, width),
      y: clamp(e.clientY - bounds.top, 0, height),
    };
    e.preventDefault();
  }, [clearMenu, clearSelection, selectionEnabled, setSelectingFlag, height, width]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current || !selectionEnabled) return;
    updateCustomSelection(e.clientX, e.clientY);
  }, [selectionEnabled, updateCustomSelection]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    let selection = null;
    if (dragStartRef.current) {
      selection = updateCustomSelection(e.clientX, e.clientY);
    }
    if (selection && selection.rects.length > 0 && selection.text) {
      setMenu({
        text: selection.text,
        rects: selection.rects,
        x: e.clientX,
        y: e.clientY + 8,
        anchor: "cursor",
      });
    }
    if (releaseSelectingTimerRef.current !== null) {
      window.clearTimeout(releaseSelectingTimerRef.current);
    }
    releaseSelectingTimerRef.current = window.setTimeout(() => {
      dragStartRef.current = null;
      setSelectingFlag(false);
      releaseSelectingTimerRef.current = null;
    }, 0);
  }, [setSelectingFlag, updateCustomSelection]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!selectionEnabled) {
      return;
    }

    if (selectionRects.length > 0 && selectionText) {
      e.preventDefault();
      setMenu({
        text: selectionText,
        rects: selectionRects,
        x: e.clientX,
        y: e.clientY + 8,
        anchor: "cursor",
      });
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
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
  }, [height, selectionEnabled, selectionRects, selectionText, width]);

  useEffect(() => {
    if (selectionEnabled) return;
    clearMenu();
    clearSelection();
    dragStartRef.current = null;
    if (releaseSelectingTimerRef.current !== null) {
      window.clearTimeout(releaseSelectingTimerRef.current);
      releaseSelectingTimerRef.current = null;
    }
    setSelectingFlag(false);
  }, [clearMenu, clearSelection, selectionEnabled, setSelectingFlag]);

  useEffect(() => {
    document.addEventListener("selectionchange", updateSelection);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("scroll", clearMenu, true);
    window.addEventListener("resize", clearMenu);
    return () => {
      document.removeEventListener("selectionchange", updateSelection);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("scroll", clearMenu, true);
      window.removeEventListener("resize", clearMenu);
      if (releaseSelectingTimerRef.current !== null) {
        window.clearTimeout(releaseSelectingTimerRef.current);
        releaseSelectingTimerRef.current = null;
      }
    };
  }, [clearMenu, handleMouseMove, handleMouseUp, updateSelection]);

  const findMatchedItems = (rects: Array<{ x: number; y: number; width: number; height: number }>) => {
    return matchTextItemsToRects(textItems, rects, width, height);
  };

  return { menu, clearMenu, clearSelection, selectionRects, layerRef, handleContextMenu, handleMouseDown, findMatchedItems };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
