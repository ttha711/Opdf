import { useEffect } from "react";
import * as fabric from "fabric";
import type { MutableRefObject } from "react";
import type { AnnotationToolDefaults } from "../lib/app-types";

interface UseFabricDrawingParams {
  fabricRef: MutableRefObject<fabric.Canvas | null>;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  highlightMode: boolean;
  shapeMode: boolean;
  redactMode: boolean;
  measureMode: boolean;
  aiPatchMode: boolean;
  annotationToolDefaults: AnnotationToolDefaults;
  pageNumber: number;
  onAnnotationCreated?: (page: number, kind: string, payload: Record<string, unknown>) => void;
  setMeasureResult: (value: string | null) => void;
  /** Called right after an ai-patch image is placed so the parent can switch back to 'select' mode */
  onPatchApplied?: () => void;
}

export function useFabricDrawing({
  fabricRef,
  canvasRef,
  highlightMode,
  shapeMode,
  redactMode,
  measureMode,
  aiPatchMode,
  annotationToolDefaults,
  pageNumber,
  onAnnotationCreated,
  setMeasureResult,
  onPatchApplied,
}: UseFabricDrawingParams) {
  useEffect(() => {
    const canvasMaybe = fabricRef.current;
    if (!canvasMaybe) return;
    const canvas = canvasMaybe;

    const activeRectRef = { current: null as fabric.Rect | null };
    const measureLineRef = { current: null as fabric.Line | null };
    const measureTextRef = { current: null as fabric.Text | null };
    const isDrawingRef = { current: false };
    const drawStartRef = { current: { x: 0, y: 0 } };
    const draftBoundsRef = { current: { left: 0, top: 0, width: 0, height: 0 } };

    const drawingHighlight = highlightMode;
    const drawingShape = shapeMode;
    const drawingRedact = redactMode;
    const drawingMeasure = measureMode;
    const drawingAiPatch = aiPatchMode;
    const isAnyDraw = drawingHighlight || drawingShape || drawingRedact || drawingMeasure || drawingAiPatch;
    const activeDefaults = drawingHighlight
      ? annotationToolDefaults.highlight
      : drawingShape
        ? annotationToolDefaults.shape
        : drawingRedact
          ? annotationToolDefaults.redact
          : null;

    const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

    const drawingSurface =
      ((canvas as any).upperCanvasEl as HTMLCanvasElement | undefined) ?? canvasRef.current;

    const getCanvasPoint = (event: PointerEvent) => {
      const el = drawingSurface;
      if (!el) return null;
      const bounds = el.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return null;
      const canvasW = canvas.getWidth();
      const canvasH = canvas.getHeight();
      return {
        x: clamp(((event.clientX - bounds.left) / bounds.width) * canvasW, 0, canvasW),
        y: clamp(((event.clientY - bounds.top) / bounds.height) * canvasH, 0, canvasH),
      };
    };

    const updatePreview = (pointer: { x: number; y: number }, shiftKey = false) => {
      const { x: sx, y: sy } = drawStartRef.current;
      if (!isDrawingRef.current) return;

      let endX = pointer.x;
      let endY = pointer.y;
      if (drawingMeasure && shiftKey) {
        const dx = endX - sx;
        const dy = endY - sy;
        const angle = Math.atan2(dy, dx);
        const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const distance = Math.sqrt(dx * dx + dy * dy);
        endX = sx + distance * Math.cos(snappedAngle);
        endY = sy + distance * Math.sin(snappedAngle);
      }

      if (drawingMeasure) {
        const line = measureLineRef.current;
        const text = measureTextRef.current;
        if (line && text) {
          line.set({ x2: endX, y2: endY });
          const dx = endX - sx;
          const dy = endY - sy;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const value = distance.toFixed(2);
          text.set({ text: `${value} px`, left: endX + 10, top: endY + 10 });
          setMeasureResult(`${value} px`);
          canvas.renderAll();
        }
        return;
      }

      const rect = activeRectRef.current;
      if (!rect) return;
      const nextBounds = {
        left: Math.min(pointer.x, sx),
        top: Math.min(pointer.y, sy),
        width: Math.abs(pointer.x - sx),
        height: Math.abs(pointer.y - sy),
      };
      draftBoundsRef.current = nextBounds;
      rect.set(nextBounds);
      rect.setCoords();
      canvas.renderAll();
    };

    function commitDraw() {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      if (drawingMeasure) {
        if (measureLineRef.current) canvas.remove(measureLineRef.current);
        if (measureTextRef.current) canvas.remove(measureTextRef.current);
        measureLineRef.current = null;
        measureTextRef.current = null;
        canvas.renderAll();
        return;
      }

      const rect = activeRectRef.current;
      if (!rect) return;

      const bounds = draftBoundsRef.current;
      const canvasW = canvas.getWidth();
      const canvasH = canvas.getHeight();

      if (bounds.width > 5 && bounds.height > 5 && onAnnotationCreated) {
        if (drawingAiPatch) {
          // Compute popup position using the rendered canvas element bounds so the position
          // is correct regardless of CSS zoom/scale applied to the page-zoom-layer container.
          const drawingSurfaceEl = drawingSurface;
          let popupClientX = 0;
          let popupClientY = 0;

          if (drawingSurfaceEl) {
            const elBounds = drawingSurfaceEl.getBoundingClientRect();
            const canvasW = canvas.getWidth();
            const canvasH = canvas.getHeight();
            // Map canvas-space bottom-right corner of the selection to screen coords.
            const scaleX = elBounds.width / canvasW;
            const scaleY = elBounds.height / canvasH;
            popupClientX = elBounds.left + (bounds.left + bounds.width) * scaleX;
            popupClientY = elBounds.top + (bounds.top + bounds.height) * scaleY;
          }

          const localBounds = { ...bounds };

          showPromptPopup(popupClientX, popupClientY, async (text) => {
              const bgCanvas = canvasRef.current;
              if (bgCanvas) {
                const cx = localBounds.left;
                const cy = localBounds.top;
                const cw = localBounds.width;
                const ch = localBounds.height;

                let bgColor = "#ffffff";
                let textColor = "#000000";
                let fontFamily = "Arial, sans-serif";
                let fontSize = Math.max(10, Math.min(ch * 0.75, 48));
                let fontWeight = "normal";
                let fontStyle = "normal";

                try {
                  // 1. Get dominant color (background)
                  const ctx = bgCanvas.getContext("2d");
                  if (ctx) {
                    const imgData = ctx.getImageData(
                      Math.max(0, Math.floor(cx)), 
                      Math.max(0, Math.floor(cy)), 
                      Math.max(1, Math.floor(cw)), 
                      Math.max(1, Math.floor(ch))
                    );
                    const data = imgData.data;
                    const colorCounts: Record<string, number> = {};
                    let maxCount = 0;
                    for (let i = 0; i < data.length; i += 16) {
                      const r = data[i];
                      const g = data[i+1];
                      const b = data[i+2];
                      const color = `rgb(${r},${g},${b})`;
                      colorCounts[color] = (colorCounts[color] || 0) + 1;
                      if (colorCounts[color] > maxCount) {
                        maxCount = colorCounts[color];
                        bgColor = color;
                      }
                    }
                  }

                  // 2. Query textLayer to extract original styles
                  const pageEl = document.querySelector(`[data-page="${pageNumber}"]`);
                  if (pageEl) {
                    const textLayer = pageEl.querySelector('.textLayer');
                    if (textLayer) {
                      const spans = textLayer.querySelectorAll('span');
                      let bestSpan: HTMLSpanElement | null = null;
                      let maxOverlap = 0;
                      
                      const layerRect = textLayer.getBoundingClientRect();
                      for (const span of Array.from(spans)) {
                        const spanRect = span.getBoundingClientRect();
                        // Convert span screen coords to canvas-space for overlap check
                        const elBoundsInner = drawingSurface?.getBoundingClientRect();
                        if (!elBoundsInner) continue;
                        const canvasWInner = canvas.getWidth();
                        const canvasHInner = canvas.getHeight();
                        const scaleXInner = canvasWInner / elBoundsInner.width;
                        const scaleYInner = canvasHInner / elBoundsInner.height;
                        const localSpanX = (spanRect.left - elBoundsInner.left) * scaleXInner;
                        const localSpanY = (spanRect.top - elBoundsInner.top) * scaleYInner;
                        const localSpanW = spanRect.width * scaleXInner;
                        const localSpanH = spanRect.height * scaleYInner;
                        void layerRect; // no longer used directly
                        
                        const xOverlap = Math.max(0, Math.min(cx + cw, localSpanX + localSpanW) - Math.max(cx, localSpanX));
                        const yOverlap = Math.max(0, Math.min(cy + ch, localSpanY + localSpanH) - Math.max(cy, localSpanY));
                        const overlapArea = xOverlap * yOverlap;
                        
                        if (overlapArea > maxOverlap) {
                          maxOverlap = overlapArea;
                          bestSpan = span;
                        }
                      }
                      
                      if (bestSpan) {
                        const computedStyle = window.getComputedStyle(bestSpan);
                        fontFamily = computedStyle.fontFamily;
                        fontSize = parseFloat(computedStyle.fontSize) || fontSize;
                        textColor = computedStyle.color;
                        fontWeight = computedStyle.fontWeight;
                        fontStyle = computedStyle.fontStyle;
                      }
                    }
                  }
                  let calculatedFontSize = fontSize;
                  if (pageEl) {
                    const textLayer = pageEl.querySelector('.textLayer');
                    if (textLayer) {
                      const textLayerRect = textLayer.getBoundingClientRect();
                      const scaleY = canvas.getHeight() / textLayerRect.height;
                      calculatedFontSize = fontSize * scaleY;
                    }
                  }

                  onAnnotationCreated(pageNumber, "note", {
                    x: Math.min(Math.max(cx / canvasW, 0), 1),
                    y: Math.min(Math.max(cy / canvasH, 0), 1),
                    width: Math.min(Math.max(cw / canvasW, 0), 1),
                    height: Math.min(Math.max(ch / canvasH, 0), 1),
                    text: text,
                    color: bgColor, // Dùng làm màu nền cho note
                    textColor: textColor,
                    fontSize: Math.round(calculatedFontSize),
                    fontFamily: fontFamily,
                    isPatch: true,
                    image: undefined,
                    imageType: undefined,
                  });

                  // Auto-switch back to select mode so the user can immediately drag/resize the patch
                  onPatchApplied?.();
                } catch (e) {
                  console.error("Local style extraction failed:", e);
                }
              }
            }, () => {});
        } else {
          let kind = "shape";
          if (drawingHighlight) kind = "highlight";
          else if (drawingRedact) kind = "redact";

          onAnnotationCreated(pageNumber, kind, {
            x: Math.min(Math.max(bounds.left / canvasW, 0), 1),
            y: Math.min(Math.max(bounds.top / canvasH, 0), 1),
            width: Math.min(Math.max(bounds.width / canvasW, 0), 1),
            height: Math.min(Math.max(bounds.height / canvasH, 0), 1),
            ...(activeDefaults
              ? {
                  color: activeDefaults.color,
                  stroke: activeDefaults.color,
                  opacity: activeDefaults.opacity,
                  strokeWidth: activeDefaults.size,
                }
              : {}),
          });
        }
      }

      canvas.remove(rect);
      canvas.renderAll();
      activeRectRef.current = null;
      draftBoundsRef.current = { left: 0, top: 0, width: 0, height: 0 };
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!isAnyDraw) return;
      event.preventDefault();
      drawingSurface?.setPointerCapture?.(event.pointerId);
      const pointer = getCanvasPoint(event);
      if (!pointer) return;
      drawStartRef.current = { x: pointer.x, y: pointer.y };
      draftBoundsRef.current = { left: pointer.x, top: pointer.y, width: 0, height: 0 };
      isDrawingRef.current = true;

      if (drawingMeasure) {
        const line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: "#10b981",
          strokeWidth: 2,
          selectable: false,
          evented: false,
        });
        const text = new fabric.Text("0.00 px", {
          left: pointer.x + 10,
          top: pointer.y + 10,
          fontSize: 14,
          fill: "#ffffff",
          backgroundColor: "rgba(16, 185, 129, 0.9)",
          fontFamily: "monospace",
          selectable: false,
          evented: false,
        });
        measureLineRef.current = line;
        measureTextRef.current = text;
        canvas.add(line, text);
        canvas.renderAll();
        return;
      }

      const preview = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        originX: "left",
        originY: "top",
        width: 0,
        height: 0,
        fill: drawingHighlight
          ? activeDefaults?.color ?? "rgba(250, 204, 21, 0.4)"
          : drawingRedact
          ? activeDefaults?.color ?? "rgba(0, 0, 0, 0.6)"
          : drawingAiPatch
          ? "rgba(0, 97, 213, 0.1)"
          : "transparent",
        opacity: drawingAiPatch ? 1 : (activeDefaults?.opacity ?? 1),
        stroke: drawingShape ? activeDefaults?.color ?? "#ef4444" : drawingRedact ? activeDefaults?.color ?? "#000000" : drawingAiPatch ? "#0061d5" : undefined,
        strokeWidth: drawingShape || drawingRedact ? activeDefaults?.size ?? 2 : drawingAiPatch ? 1.5 : 0,
        strokeDashArray: drawingShape || drawingRedact ? [5, 5] : drawingAiPatch ? [4, 4] : undefined,
        selectable: false,
        evented: false,
      });
      activeRectRef.current = preview;
      canvas.add(preview);
      canvas.renderAll();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!isDrawingRef.current) return;
      event.preventDefault();
      const pointer = getCanvasPoint(event);
      if (pointer) updatePreview(pointer, event.shiftKey);
    };

    const onDocumentPointerMove = (event: PointerEvent) => {
      if (!isDrawingRef.current) return;
      const pointer = getCanvasPoint(event);
      if (pointer) updatePreview(pointer, event.shiftKey);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!isDrawingRef.current) return;
      const pointer = getCanvasPoint(event);
      if (pointer) updatePreview(pointer, event.shiftKey);
      drawingSurface?.releasePointerCapture?.(event.pointerId);
      commitDraw();
    };

    const onDocumentPointerUp = () => {
      if (isDrawingRef.current) commitDraw();
    };

    drawingSurface?.addEventListener("pointerdown", onPointerDown);
    drawingSurface?.addEventListener("pointermove", onPointerMove);
    drawingSurface?.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointermove", onDocumentPointerMove);
    document.addEventListener("pointerup", onDocumentPointerUp);

    return () => {
      drawingSurface?.removeEventListener("pointerdown", onPointerDown);
      drawingSurface?.removeEventListener("pointermove", onPointerMove);
      drawingSurface?.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointermove", onDocumentPointerMove);
      document.removeEventListener("pointerup", onDocumentPointerUp);

      if (isDrawingRef.current && activeRectRef.current) {
        canvas.remove(activeRectRef.current);
        canvas.renderAll();
        activeRectRef.current = null;
        isDrawingRef.current = false;
      }
    };
  }, [highlightMode, shapeMode, redactMode, measureMode, aiPatchMode, annotationToolDefaults, onAnnotationCreated, pageNumber, setMeasureResult, fabricRef, canvasRef, onPatchApplied]);
}

const showPromptPopup = (clientX: number, clientY: number, onConfirm: (text: string) => void, onCancel: () => void) => {
  const div = document.createElement("div");
  div.style.position = "fixed";
  div.style.left = `${clientX}px`;
  div.style.top = `${clientY}px`;
  div.style.zIndex = "100000";
  div.style.background = "var(--bg-toolbar, #ffffff)";
  div.style.border = "1px solid var(--border-color, #ccc)";
  div.style.borderRadius = "8px";
  div.style.padding = "10px";
  div.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
  div.style.display = "flex";
  div.style.flexDirection = "column";
  div.style.gap = "8px";
  div.style.width = "240px";

  const label = document.createElement("span");
  label.innerText = "Thay thế văn bản (AI Patch):";
  label.style.fontSize = "12px";
  label.style.fontWeight = "bold";
  label.style.color = "var(--text-primary, #000)";
  div.appendChild(label);

  const textarea = document.createElement("textarea");
  textarea.placeholder = "Nhập văn bản thay thế...";
  textarea.style.width = "100%";
  textarea.style.height = "60px";
  textarea.style.resize = "none";
  textarea.style.borderRadius = "4px";
  textarea.style.border = "1px solid var(--border-color, #ccc)";
  textarea.style.padding = "4px";
  textarea.style.fontSize = "13px";
  textarea.style.outline = "none";
  div.appendChild(textarea);

  const btnContainer = document.createElement("div");
  btnContainer.style.display = "flex";
  btnContainer.style.justifyContent = "flex-end";
  btnContainer.style.gap = "6px";

  const cancelBtn = document.createElement("button");
  cancelBtn.innerText = "Hủy";
  cancelBtn.style.padding = "4px 8px";
  cancelBtn.style.fontSize = "12px";
  cancelBtn.style.border = "1px solid var(--border-color, #ccc)";
  cancelBtn.style.borderRadius = "4px";
  cancelBtn.style.background = "transparent";
  cancelBtn.style.cursor = "pointer";
  cancelBtn.onclick = () => {
    document.body.removeChild(div);
    onCancel();
  };

  const confirmBtn = document.createElement("button");
  confirmBtn.innerText = "Áp dụng";
  confirmBtn.style.padding = "4px 8px";
  confirmBtn.style.fontSize = "12px";
  confirmBtn.style.border = "none";
  confirmBtn.style.borderRadius = "4px";
  confirmBtn.style.background = "#0061d5";
  confirmBtn.style.color = "#ffffff";
  confirmBtn.style.cursor = "pointer";
  confirmBtn.onclick = () => {
    const val = textarea.value.trim();
    document.body.removeChild(div);
    if (val) {
      onConfirm(val);
    } else {
      onCancel();
    }
  };

  btnContainer.appendChild(cancelBtn);
  btnContainer.appendChild(confirmBtn);
  div.appendChild(btnContainer);
  document.body.appendChild(div);
  textarea.focus();
};
