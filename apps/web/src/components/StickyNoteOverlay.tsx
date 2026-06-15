import { useEffect, useRef, useState } from "react";
import type { Annotation } from "@opdf/core";

interface StickyNoteOverlayProps {
  annotations: Annotation[];
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  onUpdate: (id: string, payload: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}

interface StickyNoteIconProps {
  annotation: Annotation;
  pageWidth: number;
  pageHeight: number;
  onUpdate: (id: string, payload: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}

function StickyNoteIcon({ annotation, pageWidth, pageHeight, onUpdate, onDelete }: StickyNoteIconProps) {
  const payload = annotation.payload as Record<string, unknown>;
  const x = (payload.x as number) ?? 0;
  const y = (payload.y as number) ?? 0;
  const text = (payload.text as string) ?? "";
  const color = (payload.color as string) ?? "#fff3a3";

  const [isOpen, setIsOpen] = useState(false);
  const [editText, setEditText] = useState(text);
  const [isDragging, setIsDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const iconRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; annX: number; annY: number } | null>(null);

  // Update editText when annotation changes
  useEffect(() => {
    setEditText(text);
  }, [text]);

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      annX: x,
      annY: y,
    };
    setIsDragging(true);
  }

  useEffect(() => {
    if (!isDragging) return;

    function onMouseMove(e: MouseEvent) {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      const nx = Math.max(0, Math.min(1, dragStartRef.current.annX + dx / pageWidth));
      const ny = Math.max(0, Math.min(1, dragStartRef.current.annY + dy / pageHeight));
      onUpdate(annotation.id, { x: nx, y: ny });
    }

    function onMouseUp() {
      setIsDragging(false);
      dragStartRef.current = null;
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, pageWidth, pageHeight, annotation.id, onUpdate]);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isDragging) return;
    setIsOpen((v) => !v);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Delete" || e.key === "Backspace") {
      if (!isOpen) {
        onDelete(annotation.id);
      }
    }
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  function handlePopoverClose() {
    onUpdate(annotation.id, { text: editText });
    setIsOpen(false);
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  useEffect(() => {
    if (!contextMenu) return;
    function handler() {
      closeContextMenu();
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [contextMenu]);

  const iconLeft = x * pageWidth;
  const iconTop = y * pageHeight;

  return (
    <>
      <div
        ref={iconRef}
        tabIndex={0}
        style={{
          position: "absolute",
          left: iconLeft,
          top: iconTop,
          width: 24,
          height: 24,
          cursor: isDragging ? "grabbing" : "grab",
          zIndex: 100,
          userSelect: "none",
          outline: "none",
        }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        title={text || "Sticky note (click to edit)"}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill={color} stroke="#888" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16l4-4h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
        </svg>
        {text && (
          <span style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: 8,
            height: 8,
            background: "#f59e0b",
            borderRadius: "50%",
            border: "1px solid white",
          }} />
        )}
      </div>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            left: Math.min(iconLeft + 28, pageWidth - 200),
            top: Math.max(iconTop - 10, 0),
            zIndex: 200,
            background: color,
            border: "1px solid #ccc",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            padding: 8,
            minWidth: 180,
            maxWidth: 240,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                color: "#666",
                padding: "0 2px",
              }}
              onClick={handlePopoverClose}
              title="Close"
            >
              ✕
            </button>
          </div>
          <textarea
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                handlePopoverClose();
              }
            }}
            style={{
              width: "100%",
              minHeight: 80,
              resize: "vertical",
              border: "1px solid #ccc",
              borderRadius: 4,
              padding: 4,
              fontSize: 12,
              background: "rgba(255,255,255,0.7)",
              fontFamily: "inherit",
              outline: "none",
            }}
            placeholder="Type your note..."
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <button
              style={{
                background: "none",
                border: "1px solid #ccc",
                borderRadius: 4,
                cursor: "pointer",
                padding: "2px 8px",
                fontSize: 11,
                color: "#c00",
              }}
              onClick={() => { onDelete(annotation.id); setIsOpen(false); }}
            >
              Delete
            </button>
            <button
              style={{
                background: "#10b981",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                padding: "2px 8px",
                fontSize: 11,
                color: "white",
              }}
              onClick={handlePopoverClose}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999,
            background: "var(--bg-toolbar, #fff)",
            border: "1px solid var(--border-color, #ccc)",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            padding: "4px 0",
            minWidth: 130,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "6px 14px", cursor: "pointer", fontSize: 12 }}
            onClick={() => {
              setIsOpen(true);
              closeContextMenu();
            }}
          >
            Edit note
          </button>
          <button
            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "6px 14px", cursor: "pointer", fontSize: 12, color: "#c00" }}
            onClick={() => { onDelete(annotation.id); closeContextMenu(); }}
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
}

export function StickyNoteOverlay({ annotations, pageNumber, pageWidth, pageHeight, onUpdate, onDelete }: StickyNoteOverlayProps) {
  const stickyAnnotations = annotations.filter((a) => (a.kind as string) === "sticky" && a.page === pageNumber);

  if (stickyAnnotations.length === 0) return null;

  return (
    <>
      {stickyAnnotations.map((ann) => (
        <StickyNoteIcon
          key={ann.id}
          annotation={ann}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}
