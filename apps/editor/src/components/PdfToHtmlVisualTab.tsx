import React from "react";
import { Sparkles, Compass, Loader2 } from "lucide-react";
import { PageResult } from "../types";
import { getClosestHTMLElement } from "../lib/pdfToHtmlEditorGuards";
import { cn } from "../lib/utils";

interface VisualTabProps {
  pdfPages: PageResult[];
  activePdfPageIdx: number;
  showRawHtml: boolean;
  setShowRawHtml: (val: boolean) => void;
  rawHtmlText: string;
  setRawHtmlText: (val: string) => void;
  convertSinglePage: (idx: number) => void;
  capturePageSelection: () => void;
  updatePdfPageHtml: (idx: number, htmlContent: string) => void;
  handlePrint: () => void;
  pageRenderContainerRef: React.RefObject<HTMLDivElement | null>;
}

function PdfToHtmlVisualTab({
  pdfPages,
  activePdfPageIdx,
  showRawHtml,
  setShowRawHtml,
  rawHtmlText,
  setRawHtmlText,
  convertSinglePage,
  capturePageSelection,
  updatePdfPageHtml,
  handlePrint,
  pageRenderContainerRef,
}: VisualTabProps) {
  const page = pdfPages[activePdfPageIdx];

  React.useEffect(() => {
    const renderPlaceholders = () => {
      if (!pageRenderContainerRef.current) return;
      const placeholders = pageRenderContainerRef.current.querySelectorAll(".crop-image-placeholder");
      const pageWidth = page?.pageWidth || 800;
      const pageHeight = page?.pageHeight || 1130;
      if (!placeholders.length) return;

      placeholders.forEach((el) => {
      const x = parseFloat(el.getAttribute("data-x") || "0");
      const y = parseFloat(el.getAttribute("data-y") || "0");
      
      // Preserve cropW/cropH as source crop boundaries, while data-w is the display width.
      const cropW = Math.max(1, Math.min(100, parseFloat(el.getAttribute("data-crop-w") || el.getAttribute("data-w") || "100")));
      const cropH = Math.max(1, Math.min(100, parseFloat(el.getAttribute("data-crop-h") || el.getAttribute("data-h") || "100")));
      const clampedX = Math.max(0, Math.min(100 - cropW, x));
      const clampedY = Math.max(0, Math.min(100 - cropH, y));
      
      // Set the data-crop-* helper attributes once to prevent losing source geometry
      if (!el.getAttribute("data-crop-w")) {
        el.setAttribute("data-crop-x", String(clampedX));
        el.setAttribute("data-crop-y", String(clampedY));
        el.setAttribute("data-crop-w", String(cropW));
        el.setAttribute("data-crop-h", String(cropH));
      }

      let w = parseFloat(el.getAttribute("data-w") || "100");
      
      // Setup styling: inline-block with width: w% to let them sit side-by-side
      el.className = "crop-image-placeholder my-4 border border-zinc-200 rounded-xl overflow-hidden shadow-sm bg-neutral-50 p-3 inline-block align-top text-center print-hidden";
      // @ts-ignore
      el.style.width = `${w}%`;
      
      // If already rendered, skip re-building DOM to avoid layout flash or editing cursor resets
      if (el.querySelector(".crop-preview-box")) {
        return;
      }

      // @ts-ignore
      el.innerHTML = `
        <div class="crop-preview-box" style="position: relative; overflow: hidden; width: 100%; min-height: 48px; aspect-ratio: ${cropW * pageWidth} / ${cropH * pageHeight}; margin: 0 auto; border-radius: 8px; border: 1px dashed rgb(228 228 231); transition: all 150ms ease;">
          <img src="${page?.imageUrl}" style="position: absolute; width: ${10000 / cropW}%; height: ${10000 / cropH}%; left: -${(clampedX * 100) / cropW}%; top: -${(clampedY * 100) / cropH}%; max-width: none; user-select: none;" referrerPolicy="no-referrer" />
        </div>
      `;

      const slider = el.querySelector(".crop-w-slider");
      if (slider) {
        // @ts-ignore
        slider.oninput = (e) => {
          const newVal = parseFloat(e.target.value);
          // @ts-ignore
          el.style.width = `${newVal}%`;

          const percentLabel = el.querySelector(".crop-w-percent-label");
          if (percentLabel) {
            percentLabel.textContent = `${newVal}%`;
          }
          el.setAttribute("data-w", String(newVal));
        };

        // @ts-ignore
        slider.onchange = () => {
          if (pageRenderContainerRef.current) {
            const editorDiv = pageRenderContainerRef.current.querySelector(".wysiwyg-editor") as HTMLDivElement;
            if (editorDiv) {
              const cloneEditor = editorDiv.cloneNode(true) as HTMLDivElement;
              const innerPlaceholders = cloneEditor.querySelectorAll(".crop-image-placeholder");
              
              innerPlaceholders.forEach(innerEl => {
                const currentW = innerEl.getAttribute("data-w");
                // Read original data-crop values to preserve them in the clean HTML
                const cX = innerEl.getAttribute("data-crop-x");
                const cY = innerEl.getAttribute("data-crop-y");
                const cW = innerEl.getAttribute("data-crop-w");
                const cH = innerEl.getAttribute("data-crop-h");
                
                innerEl.removeAttribute("class");
                innerEl.removeAttribute("style");
                innerEl.innerHTML = "";
                innerEl.className = "crop-image-placeholder";
                
                if (currentW) innerEl.setAttribute("data-w", currentW);
                if (cX) innerEl.setAttribute("data-crop-x", cX);
                if (cY) innerEl.setAttribute("data-crop-y", cY);
                if (cW) innerEl.setAttribute("data-crop-w", cW);
                if (cH) innerEl.setAttribute("data-crop-h", cH);
              });

              updatePdfPageHtml(activePdfPageIdx, cloneEditor.innerHTML);
            }
          }
        };
      }
    });
    };

    renderPlaceholders();
    const timer = window.setTimeout(renderPlaceholders, 120);
    return () => window.clearTimeout(timer);
  }, [page, activePdfPageIdx, showRawHtml, rawHtmlText]);

  React.useEffect(() => {
    if (showRawHtml || !pageRenderContainerRef.current) return;
    const container = pageRenderContainerRef.current;
    const editorDiv = container.querySelector(".wysiwyg-editor") as HTMLDivElement | null;
    if (!editorDiv) return;

    editorDiv.querySelectorAll<HTMLElement>('.floating-box[data-floating-box="true"]').forEach((box) => {
      box.setAttribute("contenteditable", "false");

      if (box.classList.contains("floating-text-box")) {
        const content = box.querySelector<HTMLElement>(
          ':scope > div:not([data-float-handle="true"]):not([data-float-resize="true"])'
        );
        if (content) {
          content.setAttribute("contenteditable", "true");
          content.setAttribute("spellcheck", "true");
          content.style.cursor = "text";
        }
      }

      if (box.classList.contains("floating-image-box")) {
        const image = box.querySelector<HTMLImageElement>("img");
        if (image) {
          image.setAttribute("draggable", "false");
          image.style.pointerEvents = "none";
          image.style.userSelect = "none";
        }
      }
    });

    const floatingPanel = document.createElement("div");
    floatingPanel.style.position = "absolute";
    floatingPanel.style.zIndex = "60";
    floatingPanel.style.padding = "6px";
    floatingPanel.style.borderRadius = "10px";
    floatingPanel.style.border = "1px solid #e2e8f0";
    floatingPanel.style.background = "white";
    floatingPanel.style.boxShadow = "0 8px 20px rgba(15,23,42,0.16)";
    floatingPanel.style.display = "none";
    floatingPanel.style.minWidth = "292px";
    floatingPanel.style.fontFamily = "system-ui, sans-serif";
    floatingPanel.innerHTML = `
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
        <button data-act="add-row" style="padding:2px 6px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;cursor:pointer;font-size:11px;">+ Hàng</button>
        <button data-act="del-row" style="padding:2px 6px;border:1px solid #fecaca;border-radius:6px;background:#fff1f2;color:#be123c;cursor:pointer;font-size:11px;">- Hàng</button>
        <button data-act="add-col" style="padding:2px 6px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;cursor:pointer;font-size:11px;">+ Cột</button>
        <button data-act="del-col" style="padding:2px 6px;border:1px solid #fecaca;border-radius:6px;background:#fff1f2;color:#be123c;cursor:pointer;font-size:11px;">- Cột</button>
        <button data-act="up" style="padding:2px 6px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;cursor:pointer;font-size:11px;">↑ Bảng</button>
        <button data-act="down" style="padding:2px 6px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;cursor:pointer;font-size:11px;">↓ Bảng</button>
        <button data-act="remove-table" style="padding:2px 6px;border:1px solid #fecaca;border-radius:6px;background:#fff1f2;color:#be123c;cursor:pointer;font-size:11px;">Xóa bảng</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
        <label style="font-size:10px;color:#475569;">Rộng cột <input data-act="col-width" type="range" min="60" max="520" value="140" style="vertical-align:middle;width:98px;" /></label>
        <label style="font-size:10px;color:#475569;">Cao hàng <input data-act="row-height" type="range" min="24" max="180" value="36" style="vertical-align:middle;width:98px;" /></label>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:6px;">
        <button data-align="top-left" style="font-size:10px;padding:2px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;cursor:pointer;">↖</button>
        <button data-align="top-center" style="font-size:10px;padding:2px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;cursor:pointer;">↑</button>
        <button data-align="top-right" style="font-size:10px;padding:2px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;cursor:pointer;">↗</button>
        <button data-align="middle-left" style="font-size:10px;padding:2px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;cursor:pointer;">←</button>
        <button data-align="middle-center" style="font-size:10px;padding:2px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;cursor:pointer;">•</button>
        <button data-align="middle-right" style="font-size:10px;padding:2px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;cursor:pointer;">→</button>
        <button data-align="bottom-left" style="font-size:10px;padding:2px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;cursor:pointer;">↙</button>
        <button data-align="bottom-center" style="font-size:10px;padding:2px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;cursor:pointer;">↓</button>
        <button data-align="bottom-right" style="font-size:10px;padding:2px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;cursor:pointer;">↘</button>
      </div>
    `;
    // Keep legacy panel logic for internal handlers, but do not render it in UI.
    floatingPanel.style.display = "none";
    const tableMoveHandle = document.createElement("button");
    tableMoveHandle.type = "button";
    tableMoveHandle.textContent = "✥";
    tableMoveHandle.style.position = "absolute";
    tableMoveHandle.style.zIndex = "61";
    tableMoveHandle.style.width = "16px";
    tableMoveHandle.style.height = "16px";
    tableMoveHandle.style.display = "none";
    tableMoveHandle.style.border = "1px solid #94a3b8";
    tableMoveHandle.style.borderRadius = "2px";
    tableMoveHandle.style.background = "white";
    tableMoveHandle.style.cursor = "move";
    tableMoveHandle.style.fontSize = "10px";
    tableMoveHandle.style.lineHeight = "10px";
    tableMoveHandle.style.padding = "0";
    container.appendChild(tableMoveHandle);

    const tableScaleHandle = document.createElement("button");
    tableScaleHandle.type = "button";
    tableScaleHandle.style.position = "absolute";
    tableScaleHandle.style.zIndex = "61";
    tableScaleHandle.style.width = "14px";
    tableScaleHandle.style.height = "14px";
    tableScaleHandle.style.display = "none";
    tableScaleHandle.style.border = "1px solid #94a3b8";
    tableScaleHandle.style.borderRadius = "1px";
    tableScaleHandle.style.background = "white";
    tableScaleHandle.style.cursor = "nwse-resize";
    tableScaleHandle.style.padding = "0";
    container.appendChild(tableScaleHandle);

    const addColHandle = document.createElement("button");
    addColHandle.type = "button";
    addColHandle.textContent = "+";
    addColHandle.style.position = "absolute";
    addColHandle.style.zIndex = "61";
    addColHandle.style.width = "16px";
    addColHandle.style.height = "16px";
    addColHandle.style.display = "none";
    addColHandle.style.border = "1px solid #93c5fd";
    addColHandle.style.borderRadius = "999px";
    addColHandle.style.background = "#eff6ff";
    addColHandle.style.color = "#1d4ed8";
    addColHandle.style.cursor = "pointer";
    addColHandle.style.fontSize = "12px";
    addColHandle.style.lineHeight = "12px";
    addColHandle.style.padding = "0";
    container.appendChild(addColHandle);

    const addRowHandle = document.createElement("button");
    addRowHandle.type = "button";
    addRowHandle.textContent = "+";
    addRowHandle.style.position = "absolute";
    addRowHandle.style.zIndex = "61";
    addRowHandle.style.width = "16px";
    addRowHandle.style.height = "16px";
    addRowHandle.style.display = "none";
    addRowHandle.style.border = "1px solid #93c5fd";
    addRowHandle.style.borderRadius = "999px";
    addRowHandle.style.background = "#eff6ff";
    addRowHandle.style.color = "#1d4ed8";
    addRowHandle.style.cursor = "pointer";
    addRowHandle.style.fontSize = "12px";
    addRowHandle.style.lineHeight = "12px";
    addRowHandle.style.padding = "0";
    container.appendChild(addRowHandle);

    let hoveredTable: HTMLTableElement | null = null;
    let activeCell: HTMLTableCellElement | null = null;
    let hideTimer: number | null = null;
    let movingTable: HTMLTableElement | null = null;
    let scalingTable: HTMLTableElement | null = null;
    let resizingCol: { table: HTMLTableElement; colIdx: number; startX: number; startWidth: number } | null = null;
    let resizingRow: { table: HTMLTableElement; rowIdx: number; startY: number; startHeight: number } | null = null;
    let moveStart: { x: number; y: number; left: number; top: number } | null = null;
    let scaleStart: { x: number; y: number; widths: number[]; heights: number[]; totalW: number; totalH: number } | null = null;

    const esc = (text: string) =>
      text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

    const removeTableToText = (tableEl: HTMLTableElement) => {
      const lines = Array.from(tableEl.rows)
        .map((row) =>
          Array.from(row.cells)
            .map((cell) => (cell.textContent || "").trim())
            .filter(Boolean)
            .map(esc)
            .join(" | ")
        )
        .filter(Boolean);

      const wrapper = document.createElement("div");
      wrapper.innerHTML =
        lines.length > 0
          ? lines.map((line) => `<p style="margin:0 0 0.6em 0;">${line}</p>`).join("")
          : `<p style="margin:0 0 0.6em 0;"></p>`;
      tableEl.replaceWith(wrapper);
      updatePdfPageHtml(activePdfPageIdx, editorDiv.innerHTML);
      floatingPanel.style.display = "none";
      hoveredTable = null;
    };

    const persist = () => updatePdfPageHtml(activePdfPageIdx, editorDiv.innerHTML);

    const getActiveCell = () => {
      if (activeCell && hoveredTable?.contains(activeCell)) return activeCell;
      const selected = window.getSelection();
      const node = selected?.anchorNode as Node | null;
      const fromSelection = (node instanceof HTMLElement ? node : node?.parentElement)?.closest("td,th") as HTMLTableCellElement | null;
      return fromSelection && hoveredTable?.contains(fromSelection) ? fromSelection : null;
    };

    const showPanelForTable = (tableEl: HTMLTableElement) => {
      const tableRect = tableEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      // Deprecated: hidden floating panel (Word-like handles are used instead).
      floatingPanel.style.display = "none";
      tableMoveHandle.style.left = `${tableRect.left - containerRect.left - 14}px`;
      tableMoveHandle.style.top = `${tableRect.top - containerRect.top - 2}px`;
      tableMoveHandle.style.display = "block";
      tableScaleHandle.style.left = `${tableRect.right - containerRect.left - 2}px`;
      tableScaleHandle.style.top = `${tableRect.bottom - containerRect.top - 2}px`;
      tableScaleHandle.style.display = "block";
      addColHandle.style.left = `${tableRect.right - containerRect.left - 8}px`;
      addColHandle.style.top = `${tableRect.top - containerRect.top - 22}px`;
      addColHandle.style.display = "block";
      addRowHandle.style.left = `${tableRect.left - containerRect.left - 22}px`;
      addRowHandle.style.top = `${tableRect.bottom - containerRect.top - 8}px`;
      addRowHandle.style.display = "block";

      const cell = getActiveCell();
      if (cell) {
        const cw = parseInt(cell.style.width || "140", 10);
        const rh = parseInt(cell.style.height || "36", 10);
        const colSlider = floatingPanel.querySelector('[data-act="col-width"]') as HTMLInputElement | null;
        const rowSlider = floatingPanel.querySelector('[data-act="row-height"]') as HTMLInputElement | null;
        if (colSlider && Number.isFinite(cw)) colSlider.value = String(Math.max(60, Math.min(520, cw)));
        if (rowSlider && Number.isFinite(rh)) rowSlider.value = String(Math.max(24, Math.min(180, rh)));
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const nextTable = getClosestHTMLElement(e.target, "table") as HTMLTableElement | null;
      if (!nextTable || !editorDiv.contains(nextTable)) {
        if (hideTimer) window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => {
          if (
            !tableMoveHandle.matches(":hover") &&
            !tableScaleHandle.matches(":hover") &&
            !addColHandle.matches(":hover") &&
            !addRowHandle.matches(":hover")
          ) {
            floatingPanel.style.display = "none";
            tableMoveHandle.style.display = "none";
            tableScaleHandle.style.display = "none";
            addColHandle.style.display = "none";
            addRowHandle.style.display = "none";
            hoveredTable = null;
          }
        }, 120);
        return;
      }
      hoveredTable = nextTable;
      const nextCell = getClosestHTMLElement(e.target, "td,th") as HTMLTableCellElement | null;
      if (nextCell && nextTable.contains(nextCell)) activeCell = nextCell;
      const rect = nextCell?.getBoundingClientRect();
      if (nextCell && rect) {
        const nearRight = Math.abs(rect.right - e.clientX) <= 5;
        const nearBottom = Math.abs(rect.bottom - e.clientY) <= 5;
        if (nearRight) {
          editorDiv.style.cursor = "col-resize";
        } else if (nearBottom) {
          editorDiv.style.cursor = "row-resize";
        } else {
          editorDiv.style.cursor = "";
        }
      } else {
        editorDiv.style.cursor = "";
      }
      showPanelForTable(nextTable);
    };

    const onScroll = () => {
      if (hoveredTable) showPanelForTable(hoveredTable);
    };

    const onEditorMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cell = target.closest("td,th") as HTMLTableCellElement | null;
      if (!cell) return;
      const table = cell.closest("table") as HTMLTableElement | null;
      if (!table) return;
      const rect = cell.getBoundingClientRect();
      const nearRight = Math.abs(rect.right - e.clientX) <= 5;
      const nearBottom = Math.abs(rect.bottom - e.clientY) <= 5;
      if (!nearRight && !nearBottom) return;
      e.preventDefault();
      e.stopPropagation();
      if (nearRight) {
        resizingCol = {
          table,
          colIdx: cell.cellIndex,
          startX: e.clientX,
          startWidth: rect.width,
        };
      } else if (nearBottom) {
        resizingRow = {
          table,
          rowIdx: (cell.parentElement as HTMLTableRowElement).rowIndex,
          startY: e.clientY,
          startHeight: rect.height,
        };
      }
    };

    const onFloatingClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!hoveredTable) return;
      const btn = (e.target as HTMLElement).closest("button");
      if (!btn) return;
      const act = btn.getAttribute("data-act");
      const cell = getActiveCell();
      if (!act) return;

      if (act === "remove-table") {
        removeTableToText(hoveredTable);
        return;
      }
      if (!cell) return;
      const row = cell.parentElement as HTMLTableRowElement | null;
      if (!row) return;
      const rowIdx = row.rowIndex;
      const colIdx = cell.cellIndex;

      if (act === "add-row") {
        const newRow = hoveredTable.insertRow(rowIdx + 1);
        for (let i = 0; i < row.cells.length; i++) {
          const n = newRow.insertCell(i);
          n.textContent = "";
          n.style.border = "1px solid #e2e8f0";
          n.style.padding = "6px 10px";
        }
        persist();
      } else if (act === "del-row" && hoveredTable.rows.length > 1) {
        hoveredTable.deleteRow(rowIdx);
        persist();
      } else if (act === "add-col") {
        Array.from(hoveredTable.rows).forEach((r) => {
          const c = r.insertCell(colIdx + 1);
          c.textContent = "";
          c.style.border = "1px solid #e2e8f0";
          c.style.padding = "6px 10px";
        });
        persist();
      } else if (act === "del-col" && row.cells.length > 1) {
        Array.from(hoveredTable.rows).forEach((r) => r.deleteCell(colIdx));
        persist();
      } else if (act === "up") {
        const prev = hoveredTable.previousElementSibling;
        if (prev) prev.before(hoveredTable);
        persist();
      } else if (act === "down") {
        const next = hoveredTable.nextElementSibling;
        if (next) next.after(hoveredTable);
        persist();
      }
      showPanelForTable(hoveredTable);
    };

    const onSliderInput = (e: Event) => {
      if (!hoveredTable) return;
      const target = e.target as HTMLInputElement;
      const cell = getActiveCell();
      if (!cell) return;
      const row = cell.parentElement as HTMLTableRowElement | null;
      if (!row) return;
      const rowIdx = row.rowIndex;
      const colIdx = cell.cellIndex;
      const val = `${target.value}px`;
      if (target.getAttribute("data-act") === "col-width") {
        Array.from(hoveredTable.rows).forEach((r) => {
          const c = r.cells[colIdx] as HTMLTableCellElement | undefined;
          if (c) c.style.width = val;
        });
      }
      if (target.getAttribute("data-act") === "row-height") {
        const targetRow = hoveredTable.rows[rowIdx];
        if (targetRow) {
          Array.from(targetRow.cells).forEach((c) => {
            (c as HTMLTableCellElement).style.height = val;
            (c as HTMLTableCellElement).style.verticalAlign = "middle";
          });
        }
      }
      persist();
    };

    const onAlignClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest("button[data-align]") as HTMLButtonElement | null;
      if (!btn || !hoveredTable) return;
      e.preventDefault();
      e.stopPropagation();
      const cell = getActiveCell();
      if (!cell) return;
      const map: Record<string, { h: string; v: string }> = {
        "top-left": { h: "left", v: "top" },
        "top-center": { h: "center", v: "top" },
        "top-right": { h: "right", v: "top" },
        "middle-left": { h: "left", v: "middle" },
        "middle-center": { h: "center", v: "middle" },
        "middle-right": { h: "right", v: "middle" },
        "bottom-left": { h: "left", v: "bottom" },
        "bottom-center": { h: "center", v: "bottom" },
        "bottom-right": { h: "right", v: "bottom" },
      };
      const conf = map[btn.getAttribute("data-align") || ""];
      if (!conf) return;
      cell.style.textAlign = conf.h;
      cell.style.verticalAlign = conf.v;
      persist();
    };

    const onGlobalMove = (e: MouseEvent) => {
      if (resizingCol) {
        const delta = e.clientX - resizingCol.startX;
        const next = Math.max(40, resizingCol.startWidth + delta);
        Array.from(resizingCol.table.rows).forEach((r) => {
          const c = r.cells[resizingCol!.colIdx] as HTMLTableCellElement | undefined;
          if (c) c.style.width = `${next}px`;
        });
        showPanelForTable(resizingCol.table);
      }
      if (resizingRow) {
        const delta = e.clientY - resizingRow.startY;
        const next = Math.max(24, resizingRow.startHeight + delta);
        const tr = resizingRow.table.rows[resizingRow.rowIdx];
        if (tr) {
          Array.from(tr.cells).forEach((c) => {
            (c as HTMLTableCellElement).style.height = `${next}px`;
          });
        }
        showPanelForTable(resizingRow.table);
      }
      if (movingTable && moveStart) {
        const dx = e.clientX - moveStart.x;
        const dy = e.clientY - moveStart.y;
        movingTable.style.position = "relative";
        movingTable.style.left = `${moveStart.left + dx}px`;
        movingTable.style.top = `${moveStart.top + dy}px`;
        showPanelForTable(movingTable);
      }
      if (scalingTable && scaleStart) {
        const dx = e.clientX - scaleStart.x;
        const dy = e.clientY - scaleStart.y;
        const wFactor = Math.max(0.35, (scaleStart.totalW + dx) / Math.max(1, scaleStart.totalW));
        const hFactor = Math.max(0.4, (scaleStart.totalH + dy) / Math.max(1, scaleStart.totalH));
        Array.from(scalingTable.rows).forEach((row, ri) => {
          Array.from(row.cells).forEach((cell, ci) => {
            const baseW = scaleStart.widths[ci] || 120;
            (cell as HTMLTableCellElement).style.width = `${Math.max(40, baseW * wFactor)}px`;
            const baseH = scaleStart.heights[ri] || 34;
            (cell as HTMLTableCellElement).style.height = `${Math.max(24, baseH * hFactor)}px`;
          });
        });
        showPanelForTable(scalingTable);
      }
    };

    const onGlobalUp = () => {
      if (resizingCol || resizingRow || movingTable || scalingTable) {
        persist();
      }
      resizingCol = null;
      resizingRow = null;
      movingTable = null;
      scalingTable = null;
      moveStart = null;
      scaleStart = null;
      editorDiv.style.cursor = "";
    };

    const onMoveHandleDown = (e: MouseEvent) => {
      if (!hoveredTable) return;
      e.preventDefault();
      e.stopPropagation();
      movingTable = hoveredTable;
      const left = parseFloat(movingTable.style.left || "0");
      const top = parseFloat(movingTable.style.top || "0");
      moveStart = { x: e.clientX, y: e.clientY, left, top };
    };

    const onScaleHandleDown = (e: MouseEvent) => {
      if (!hoveredTable) return;
      e.preventDefault();
      e.stopPropagation();
      scalingTable = hoveredTable;
      const firstRow = scalingTable.rows[0];
      const widths = firstRow ? Array.from(firstRow.cells).map((c) => (c as HTMLTableCellElement).getBoundingClientRect().width) : [];
      const heights = Array.from(scalingTable.rows).map((r) => {
        const c = r.cells[0] as HTMLTableCellElement | undefined;
        return c ? c.getBoundingClientRect().height : 34;
      });
      const totalW = widths.reduce((a, b) => a + b, 0) || scalingTable.getBoundingClientRect().width;
      const totalH = heights.reduce((a, b) => a + b, 0) || scalingTable.getBoundingClientRect().height;
      scaleStart = { x: e.clientX, y: e.clientY, widths, heights, totalW, totalH };
    };

    const onAddCol = (e: MouseEvent) => {
      if (!hoveredTable) return;
      e.preventDefault();
      e.stopPropagation();
      Array.from(hoveredTable.rows).forEach((r) => {
        const c = r.insertCell(r.cells.length);
        c.textContent = "";
        c.style.border = "1px solid #e2e8f0";
        c.style.padding = "6px 10px";
      });
      persist();
      showPanelForTable(hoveredTable);
    };

    const onAddRow = (e: MouseEvent) => {
      if (!hoveredTable) return;
      e.preventDefault();
      e.stopPropagation();
      const cols = hoveredTable.rows[0]?.cells.length || 1;
      const newRow = hoveredTable.insertRow(hoveredTable.rows.length);
      for (let i = 0; i < cols; i++) {
        const c = newRow.insertCell(i);
        c.textContent = "";
        c.style.border = "1px solid #e2e8f0";
        c.style.padding = "6px 10px";
      }
      persist();
      showPanelForTable(hoveredTable);
    };

    editorDiv.addEventListener("mousemove", onMouseMove);
    editorDiv.addEventListener("mousedown", onEditorMouseDown);
    editorDiv.addEventListener("scroll", onScroll);
    container.addEventListener("scroll", onScroll);
    floatingPanel.addEventListener("click", onFloatingClick);
    floatingPanel.addEventListener("click", onAlignClick);
    const colSlider = floatingPanel.querySelector('[data-act="col-width"]') as HTMLInputElement | null;
    const rowSlider = floatingPanel.querySelector('[data-act="row-height"]') as HTMLInputElement | null;
    colSlider?.addEventListener("input", onSliderInput);
    rowSlider?.addEventListener("input", onSliderInput);
    tableMoveHandle.addEventListener("mousedown", onMoveHandleDown);
    tableScaleHandle.addEventListener("mousedown", onScaleHandleDown);
    addColHandle.addEventListener("mousedown", onAddCol);
    addRowHandle.addEventListener("mousedown", onAddRow);
    window.addEventListener("mousemove", onGlobalMove);
    window.addEventListener("mouseup", onGlobalUp);

    return () => {
      editorDiv.removeEventListener("mousemove", onMouseMove);
      editorDiv.removeEventListener("mousedown", onEditorMouseDown);
      editorDiv.removeEventListener("scroll", onScroll);
      container.removeEventListener("scroll", onScroll);
      floatingPanel.removeEventListener("click", onFloatingClick);
      floatingPanel.removeEventListener("click", onAlignClick);
      colSlider?.removeEventListener("input", onSliderInput);
      rowSlider?.removeEventListener("input", onSliderInput);
      tableMoveHandle.removeEventListener("mousedown", onMoveHandleDown);
      tableScaleHandle.removeEventListener("mousedown", onScaleHandleDown);
      addColHandle.removeEventListener("mousedown", onAddCol);
      addRowHandle.removeEventListener("mousedown", onAddRow);
      window.removeEventListener("mousemove", onGlobalMove);
      window.removeEventListener("mouseup", onGlobalUp);
      if (hideTimer) window.clearTimeout(hideTimer);
      floatingPanel.remove();
      tableMoveHandle.remove();
      tableScaleHandle.remove();
      addColHandle.remove();
      addRowHandle.remove();
    };
  }, [showRawHtml, activePdfPageIdx, page?.htmlContent, updatePdfPageHtml, pageRenderContainerRef]);

  React.useEffect(() => {
    if (showRawHtml || !pageRenderContainerRef.current) return;
    const container = pageRenderContainerRef.current;
    const editorDiv = container.querySelector(".wysiwyg-editor") as HTMLDivElement | null;
    if (!editorDiv) return;

    const wrapPanel = document.createElement("div");
    wrapPanel.style.position = "absolute";
    wrapPanel.style.zIndex = "70";
    wrapPanel.style.display = "none";
    wrapPanel.style.padding = "6px";
    wrapPanel.style.border = "1px solid #dbe3ef";
    wrapPanel.style.borderRadius = "8px";
    wrapPanel.style.background = "white";
    wrapPanel.style.boxShadow = "0 6px 20px rgba(15,23,42,0.16)";
    wrapPanel.innerHTML = `
      <div style="font-size:10px;font-weight:700;color:#475569;margin-bottom:4px;">Text Wrap</div>
      <select data-wrap-select style="width:170px;font-size:11px;border:1px solid #cbd5e1;border-radius:6px;padding:3px 6px;">
        <option value="inline">In line with text</option>
        <option value="square">Square</option>
        <option value="tight">Tight</option>
        <option value="through">Through</option>
        <option value="top-bottom">Top and Bottom</option>
        <option value="behind">Behind Text</option>
        <option value="front">In Front of Text</option>
      </select>
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button data-wrap-move="true" style="font-size:10px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:6px;padding:2px 6px;cursor:pointer;">Move with Text</button>
        <button data-wrap-move="false" style="font-size:10px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:6px;padding:2px 6px;cursor:pointer;">Fix Position</button>
      </div>
    `;
    container.appendChild(wrapPanel);

    let dragBox: HTMLElement | null = null;
    let resizeBox: HTMLElement | null = null;
    let hoveredBox: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let startWidth = 0;
    let startHeight = 0;

    const persistFloating = () => {
      updatePdfPageHtml(activePdfPageIdx, editorDiv.innerHTML);
    };

    const applyWrapMode = (box: HTMLElement, mode: string) => {
      box.setAttribute("data-wrap-mode", mode);
      const moveWithText = box.getAttribute("data-move-with-text") === "true";
      box.style.float = "none";
      box.style.clear = "none";
      box.style.display = "block";
      box.style.margin = "8px 0";
      box.style.opacity = "1";
      box.style.zIndex = "25";

      if (mode === "inline") {
        box.style.position = "relative";
        box.style.left = "0px";
        box.style.top = "0px";
        box.style.display = "inline-block";
        box.style.verticalAlign = "middle";
        box.style.margin = "4px 8px 4px 0";
      } else if (mode === "square" || mode === "tight" || mode === "through") {
        box.style.position = "relative";
        box.style.left = "0px";
        box.style.top = "0px";
        box.style.float = "left";
        box.style.margin = mode === "square" ? "8px 12px 8px 0" : "6px 10px 6px 0";
      } else if (mode === "top-bottom") {
        box.style.position = "relative";
        box.style.left = "0px";
        box.style.top = "0px";
        box.style.clear = "both";
        box.style.margin = "10px auto";
      } else if (mode === "behind") {
        box.style.position = moveWithText ? "relative" : "absolute";
        box.style.zIndex = "1";
        box.style.opacity = "0.78";
      } else if (mode === "front") {
        box.style.position = moveWithText ? "relative" : "absolute";
        box.style.zIndex = "45";
        box.style.opacity = "1";
      }
    };

    const applyMoveWithText = (box: HTMLElement, moveWithText: boolean) => {
      box.setAttribute("data-move-with-text", moveWithText ? "true" : "false");
      const mode = box.getAttribute("data-wrap-mode") || "front";
      if (moveWithText) {
        box.style.position = "relative";
        box.style.left = "0px";
        box.style.top = "0px";
      } else if (mode === "front" || mode === "behind") {
        box.style.position = "absolute";
      }
    };

    const showWrapPanel = (box: HTMLElement) => {
      const boxRect = box.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      wrapPanel.style.left = `${Math.max(8, boxRect.left - containerRect.left)}px`;
      wrapPanel.style.top = `${Math.max(8, boxRect.top - containerRect.top - 70)}px`;
      wrapPanel.style.display = "block";
      const select = wrapPanel.querySelector('[data-wrap-select]') as HTMLSelectElement | null;
      if (select) select.value = box.getAttribute("data-wrap-mode") || "front";
    };

    const onMouseDown = (e: MouseEvent) => {
      const box = getClosestHTMLElement(e.target, '[data-floating-box="true"]');
      if (!box || !editorDiv.contains(box)) return;
      hoveredBox = box;
      showWrapPanel(box);

      const isResize = Boolean(getClosestHTMLElement(e.target, '[data-float-resize="true"]'));
      const isHandle = Boolean(getClosestHTMLElement(e.target, '[data-float-handle="true"]'));
      if (!isResize && !isHandle) return;

      e.preventDefault();
      e.stopPropagation();
      container.dataset.suspendSelection = "true";
      editorDiv.style.userSelect = "none";

      startX = e.clientX;
      startY = e.clientY;

      if (isResize) {
        resizeBox = box;
        startWidth = box.getBoundingClientRect().width;
        startHeight = box.getBoundingClientRect().height;
      } else {
        dragBox = box;
        const editorRect = editorDiv.getBoundingClientRect();
        const boxRect = box.getBoundingClientRect();
        startLeft = boxRect.left - editorRect.left + editorDiv.scrollLeft;
        startTop = boxRect.top - editorRect.top + editorDiv.scrollTop;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const hover = getClosestHTMLElement(e.target, '[data-floating-box="true"]');
      if (hover && editorDiv.contains(hover)) {
        hoveredBox = hover;
        showWrapPanel(hover);
      } else if (!wrapPanel.matches(":hover") && !dragBox && !resizeBox) {
        wrapPanel.style.display = "none";
      }

      if (!dragBox && !resizeBox) return;
      e.preventDefault();
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      if (dragBox) {
        const nextLeft = Math.max(0, startLeft + deltaX);
        const nextTop = Math.max(0, startTop + deltaY);
        dragBox.style.left = `${nextLeft}px`;
        dragBox.style.top = `${nextTop}px`;
      }
      if (resizeBox) {
        const nextW = Math.max(80, startWidth + deltaX);
        const nextH = Math.max(50, startHeight + deltaY);
        resizeBox.style.width = `${nextW}px`;
        resizeBox.style.height = `${nextH}px`;
      }
    };

    const onMouseUp = () => {
      if (dragBox || resizeBox) {
        persistFloating();
        window.getSelection()?.removeAllRanges();
      }
      dragBox = null;
      resizeBox = null;
      editorDiv.style.userSelect = "";
      window.setTimeout(() => {
        delete container.dataset.suspendSelection;
      }, 0);
    };

    const onWrapClick = (e: MouseEvent) => {
      const btn = getClosestHTMLElement(e.target, "button");
      if (!btn || !hoveredBox) return;
      const mv = btn.getAttribute("data-wrap-move");
      if (mv === null) return;
      e.preventDefault();
      e.stopPropagation();
      applyMoveWithText(hoveredBox, mv === "true");
      persistFloating();
      showWrapPanel(hoveredBox);
    };

    const onWrapChange = (e: Event) => {
      const target = e.target as HTMLSelectElement;
      if (!hoveredBox || target.getAttribute("data-wrap-select") === null) return;
      applyWrapMode(hoveredBox, target.value);
      persistFloating();
      showWrapPanel(hoveredBox);
    };

    container.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    wrapPanel.addEventListener("click", onWrapClick);
    wrapPanel.addEventListener("change", onWrapChange);

    return () => {
      container.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      wrapPanel.removeEventListener("click", onWrapClick);
      wrapPanel.removeEventListener("change", onWrapChange);
      wrapPanel.remove();
    };
  }, [showRawHtml, activePdfPageIdx, page?.htmlContent, updatePdfPageHtml, pageRenderContainerRef]);

  return (
    <div className="space-y-4">
      <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-700 flex items-start gap-2 select-none font-medium leading-relaxed print-hidden">
        <Sparkles className="w-4 h-4 text-indigo-650 flex-shrink-0 mt-0.5" />
        <span>
          <strong>Sửa trực tiếp tại đây:</strong> Sau khi AI chuẩn bị xong, bạn có thể bấm vào
          nội dung để sửa ngay, hoặc <strong>quét chuột bôi đen</strong> đoạn bất kỳ để AI viết lại ở thanh bên phải.
        </span>
      </div>

      {(() => {
        if (!page) return null;
        if (page.status !== "done") {
          return (
            <div className="w-full min-h-[450px] bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center text-center p-6">
              {page.status === "pending" ? (
                <Compass className="w-10 h-10 text-slate-300 mb-2" />
              ) : page.status === "converting" ? (
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-2" />
              ) : (
                <Compass className="w-10 h-10 text-red-400 mb-2" />
              )}
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                {page.status === "pending"
                  ? "Trang này chưa được chuẩn bị để sửa"
                  : page.status === "converting"
                  ? "AI đang chuẩn bị bản có thể chỉnh sửa..."
                  : "Lỗi chuẩn bị trang"}
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
                {page.status === "pending" &&
                  "Chọn nút 'Chuẩn bị trang' ở danh sách bên trái hoặc ấn nút dưới đây."}
                {page.status === "converting" &&
                  "Đang nhận diện chữ, bảng và bố cục để bạn sửa trực tiếp tại đây."}
              </p>
              {page.status === "pending" && (
                <button
                  onClick={() => convertSinglePage(activePdfPageIdx)}
                  className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-sm cursor-pointer"
                >
                  Chuẩn bị trang
                </button>
              )}
            </div>
          );
        }

        return (
          <div
            className="bg-white text-slate-800 border border-slate-200/80 p-[15mm] md:p-[20mm] w-full min-h-[900px] rounded-xl shadow-xs relative select-text a4-page-print"
            onMouseUp={capturePageSelection}
            ref={pageRenderContainerRef}
          >
            <header className="flex justify-between items-center border-b border-slate-100 pb-2 mb-6 text-[10px] text-slate-400 font-bold uppercase tracking-wider print-hidden">
              <span>Bản chỉnh sửa bằng AI</span>
              <span>Trang tài liệu {page.pageNumber}</span>
            </header>

            {showRawHtml ? (
              <div className="space-y-2 mt-4 font-sans animate-none">
                <div className="flex justify-between items-center bg-slate-900 px-4 py-2 rounded-t-xl select-none">
                  <span className="text-[10px] text-slate-300 font-bold font-mono tracking-widest uppercase">
                    Trình biên tập cấu trúc nâng cao
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Thay đổi bên dưới sẽ đồng bộ ngay lập tức
                  </span>
                </div>
                <textarea
                  value={rawHtmlText}
                  onChange={(e) => {
                    setRawHtmlText(e.target.value);
                    updatePdfPageHtml(activePdfPageIdx, e.target.value);
                  }}
                  className="w-full min-h-[620px] font-mono text-xs p-5 bg-neutral-900 text-amber-200 rounded-xl focus:outline-none border border-neutral-800 focus:ring-1 focus:ring-indigo-500 resize-y leading-relaxed shadow-inner"
                />
              </div>
            ) : (
              <div
                key={activePdfPageIdx}
                contentEditable={true}
                suppressContentEditableWarning={true}
                onBlur={(e) => {
                  updatePdfPageHtml(activePdfPageIdx, e.currentTarget.innerHTML);
                }}
                // We remove onInput to prevent layout flash and cursor loss during active typing,
                // relying on onBlur to save the final cleaned HTML safely.
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  let hasImage = false;
                  if (items) {
                    for (let i = 0; i < items.length; i++) {
                      if (items[i].type.indexOf("image") !== -1) {
                        e.preventDefault();
                        hasImage = true;
                        const file = items[i].getAsFile();
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const base64 = event.target?.result as string;
                            const baseImg = `<img src="${base64}" alt="Ảnh dán" style="max-width: 100%; height: auto; border-radius: 0.75rem; margin: 1rem auto; display: block; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);" />`;
                            if (pageRenderContainerRef.current) {
                              const editorDiv = pageRenderContainerRef.current.querySelector(
                                ".wysiwyg-editor"
                              ) as HTMLDivElement;
                              if (editorDiv) {
                                editorDiv.focus();
                                try {
                                  document.execCommand("insertHTML", false, baseImg);
                                } catch (ex) {
                                  editorDiv.innerHTML += baseImg;
                                }
                                updatePdfPageHtml(activePdfPageIdx, editorDiv.innerHTML);
                              }
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                        break;
                      }
                    }
                  }
                  if (!hasImage) {
                    const target = e.currentTarget;
                    setTimeout(() => {
                      updatePdfPageHtml(activePdfPageIdx, target.innerHTML);
                    }, 100);
                  }
                }}
                className={cn(
                  "wysiwyg-editor w-full max-w-none focus:outline-none min-h-[720px] leading-relaxed p-2 select-text selection:bg-indigo-100 rounded",
                  page.htmlContent?.includes("slide-container")
                    ? ""
                    : "prose prose-slate text-slate-800 text-xs"
                )}
                dangerouslySetInnerHTML={{ __html: page.htmlContent || "" }}
              />
            )}

            <footer className="absolute bottom-[10mm] inset-x-[15mm] md:inset-x-[20mm] flex justify-between items-center border-t border-slate-105 pt-2 text-[10px] text-slate-400 font-bold print-hidden">
              <span>Sửa trực tiếp trên bản đã chuẩn bị</span>
              <span>Bảo toàn bố cục gốc • Trang {page.pageNumber}</span>
            </footer>
          </div>
        );
      })()}
    </div>
  );
}

const MemoizedVisualTab = React.memo(PdfToHtmlVisualTab, (prevProps, nextProps) => {
  return (
    prevProps.activePdfPageIdx === nextProps.activePdfPageIdx &&
    prevProps.showRawHtml === nextProps.showRawHtml &&
    prevProps.rawHtmlText === nextProps.rawHtmlText &&
    prevProps.pdfPages === nextProps.pdfPages
  );
});

export default MemoizedVisualTab;
