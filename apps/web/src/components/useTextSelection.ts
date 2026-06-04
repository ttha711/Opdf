import { useCallback, useEffect, useRef, useState } from "react";
import type { RenderedTextItem } from "./PdfViewer.types";
import type { SelectionMenuState } from "./PdfTextSelection.types";
import { joinMatchedItems, normalizeSelectionRects } from "./PdfTextSelection.utils";

export function useTextSelection(
  selectionEnabled: boolean,
  width: number,
  height: number,
  textItems: RenderedTextItem[]
) {
  const [menu, setMenu] = useState<SelectionMenuState | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const snapGuardRef = useRef(false);
  const scrollLockRef = useRef<{
    container: HTMLElement;
    top: number;
    left: number;
    onScroll: () => void;
  } | null>(null);

  const clearMenu = useCallback(() => setMenu(null), []);

  const setSelectingFlag = useCallback((active: boolean) => {
    if (typeof document === "undefined") return;
    if (active) {
      document.body.dataset.opdfSelecting = "1";
    } else {
      delete document.body.dataset.opdfSelecting;
    }
  }, []);

  const releaseScrollLock = useCallback(() => {
    const lock = scrollLockRef.current;
    if (!lock) return;
    lock.container.removeEventListener("scroll", lock.onScroll);
    scrollLockRef.current = null;
  }, []);

  const isInteractiveDescendant = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("button, input, textarea, select, a, [role='button']"));
  };

  const snapSelectionToFullLines = useCallback((mouseEvent?: Pick<MouseEvent, "clientX" | "clientY">) => {
    if (snapGuardRef.current || !selectionEnabled) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const layer = layerRef.current;
    if (!layer || !selection.anchorNode || !layer.contains(selection.anchorNode)) {
      return;
    }

    const range = selection.getRangeAt(0);
    const layerBounds = layer.getBoundingClientRect();
    const rectsFromSelection = normalizeSelectionRects(Array.from(range.getClientRects()), layerBounds, width, height);
    const dragStart = dragStartRef.current;
    const dragRect = dragStart && mouseEvent
      ? {
          left: Math.min(dragStart.x, mouseEvent.clientX),
          top: Math.min(dragStart.y, mouseEvent.clientY),
          right: Math.max(dragStart.x, mouseEvent.clientX),
          bottom: Math.max(dragStart.y, mouseEvent.clientY),
        }
      : null;
    const rects = dragRect
      ? [{ left: dragRect.left, top: dragRect.top, right: dragRect.right, bottom: dragRect.bottom }]
      : rectsFromSelection.map((rect) => ({
          left: layerBounds.left + rect.x * width,
          top: layerBounds.top + rect.y * height,
          right: layerBounds.left + (rect.x + rect.width) * width,
          bottom: layerBounds.top + (rect.y + rect.height) * height,
        }));
    if (rects.length === 0) return;

    const lineEls = Array.from(layer.children).filter(
      (child): child is HTMLSpanElement => child instanceof HTMLSpanElement,
    );
    if (lineEls.length === 0) return;

    const lineRects = lineEls.map((el, index) => ({ el, index, rect: el.getBoundingClientRect() }));
    const matchedIndices = lineRects
      .filter(({ rect }) =>
        rects.some((r) => {
          return !(r.right < rect.left - 4 || r.left > rect.right + 4 || r.bottom < rect.top - 4 || r.top > rect.bottom + 4);
        }),
      )
      .map(({ index }) => index);

    if (matchedIndices.length === 0) return;

    const lineStats = lineRects;
    const expandForward = (startIndex: number) => {
      let endIndex = startIndex;
      while (endIndex + 1 < lineStats.length) {
        const curr = lineStats[endIndex].rect;
        const next = lineStats[endIndex + 1].rect;
        const verticalGap = next.top - curr.bottom;
        const sameBlock = verticalGap >= 0 && verticalGap <= Math.max(8, curr.height * 0.9);
        const alignX = Math.abs(next.left - curr.left) < Math.max(24, curr.width * 0.06);
        if (!sameBlock || !alignX) break;
        endIndex += 1;
      }
      return endIndex;
    };

    const expandBackward = (endIndex: number) => {
      let startIndex = endIndex;
      while (startIndex - 1 >= 0) {
        const curr = lineStats[startIndex].rect;
        const prev = lineStats[startIndex - 1].rect;
        const verticalGap = curr.top - prev.bottom;
        const sameBlock = verticalGap >= 0 && verticalGap <= Math.max(8, prev.height * 0.9);
        const alignX = Math.abs(curr.left - prev.left) < Math.max(24, prev.width * 0.06);
        if (!sameBlock || !alignX) break;
        startIndex -= 1;
      }
      return startIndex;
    };

    const earliest = Math.min(...matchedIndices);
    const latest = Math.max(...matchedIndices);
    const shouldExpandParagraph = rects.length > 1 || (dragRect ? (dragRect.bottom - dragRect.top) > Math.max(18, lineStats[earliest].rect.height * 1.4) : false);
    const firstIndex = shouldExpandParagraph ? expandBackward(earliest) : earliest;
    const lastIndex = shouldExpandParagraph ? expandForward(latest) : latest;
    const firstEl = lineEls[firstIndex] as HTMLSpanElement | undefined;
    const lastEl = lineEls[lastIndex] as HTMLSpanElement | undefined;
    const firstText = firstEl?.firstChild;
    const lastText = lastEl?.firstChild;
    if (!firstEl || !lastEl || !firstText || !lastText) return;

    snapGuardRef.current = true;
    releaseScrollLock();
    setSelectingFlag(true);
    const scrollContainer = layer.closest(".viewer-area") as HTMLElement | null;
    const restoreScrollTop = scrollContainer?.scrollTop ?? null;
    const restoreScrollLeft = scrollContainer?.scrollLeft ?? null;
    if (scrollContainer && restoreScrollTop !== null && restoreScrollLeft !== null) {
      const onScroll = () => {
        if (scrollContainer.scrollTop !== restoreScrollTop) scrollContainer.scrollTop = restoreScrollTop;
        if (scrollContainer.scrollLeft !== restoreScrollLeft) scrollContainer.scrollLeft = restoreScrollLeft;
      };
      scrollLockRef.current = { container: scrollContainer, top: restoreScrollTop, left: restoreScrollLeft, onScroll };
      scrollContainer.addEventListener("scroll", onScroll);
    }
    const snappedRange = document.createRange();
    snappedRange.setStart(firstText, 0);
    snappedRange.setEnd(lastText, lastText.textContent?.length ?? 0);
    selection.removeAllRanges();
    selection.addRange(snappedRange);
    const restoreScroll = () => {
      if (scrollContainer && restoreScrollTop !== null && restoreScrollLeft !== null) {
        scrollContainer.scrollTop = restoreScrollTop;
        scrollContainer.scrollLeft = restoreScrollLeft;
      }
    };
    window.requestAnimationFrame(() => {
      restoreScroll();
      const pinScroll = window.setInterval(restoreScroll, 50);
      window.setTimeout(() => {
        window.clearInterval(pinScroll);
        restoreScroll();
        releaseScrollLock();
        window.setTimeout(() => setSelectingFlag(false), 0);
        snapGuardRef.current = false;
      }, 2000);
    });
  }, [height, releaseScrollLock, selectionEnabled, setSelectingFlag, width]);

  const updateSelection = useCallback(() => {
    if (!selectionEnabled) {
      clearMenu();
      releaseScrollLock();
      setSelectingFlag(false);
      return;
    }
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? "";
    if (!selection || selection.rangeCount === 0 || !selectedText) {
      clearMenu();
      releaseScrollLock();
      setSelectingFlag(false);
    }
  }, [clearMenu, releaseScrollLock, selectionEnabled, setSelectingFlag]);

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
    releaseScrollLock();
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  }, [releaseScrollLock, selectionEnabled, setSelectingFlag]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    const clientX = e.clientX;
    const clientY = e.clientY;
    window.requestAnimationFrame(() => {
      snapSelectionToFullLines({ clientX, clientY });
      dragStartRef.current = null;
    });
  }, [snapSelectionToFullLines]);

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
    return textItems.filter(item => {
      return rects.some(r => {
        const pxLeft = r.x * width;
        const pxTop = r.y * height;
        const pxRight = (r.x + r.width) * width;
        const pxBottom = (r.y + r.height) * height;

        const itemLeft = item.left;
        const itemTop = item.top;
        const itemRight = item.left + item.width;
        const itemBottom = item.top + item.height;
        const tolerance = Math.max(4, Math.min(8, Math.round(item.height * 0.3)));

        return !(
          pxRight < itemLeft - tolerance ||
          pxLeft > itemRight + tolerance ||
          pxBottom < itemTop - tolerance ||
          pxTop > itemBottom + tolerance
        );
      });
    });
  };

  return { menu, clearMenu, layerRef, handleContextMenu, handleMouseDown, findMatchedItems };
}
