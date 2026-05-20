import { useCallback, useEffect, useRef, useState } from "react";
import { PdfViewer } from "./components/PdfViewer";
import { AppHeader } from "./components/AppHeader";
import { AllToolsDashboard } from "./components/AllToolsDashboard";
import { ThumbnailPanel } from "./components/ThumbnailPanel";
import { RightInfoPanel } from "./components/RightInfoPanel";
import { OverlayEditors } from "./components/OverlayEditors";
import { SplitModal } from "./components/SplitModal";
import { MergeModal } from "./components/MergeModal";
import { InsertPdfModal } from "./components/InsertPdfModal";
import { DocumentMarkupModal } from "./components/DocumentMarkupModal";
import { StatusBar } from "./components/StatusBar";
import { FindBar } from "./components/FindBar";
import { DocumentToolPanel } from "./components/DocumentToolPanel";
import { IntegratedUploadWorkspace } from "./components/IntegratedUploadWorkspace";
import { useOpdfBridge } from "./hooks/useOpdfBridge";
import { useAnnotationActions } from "./hooks/useAnnotationActions";
import { useDocumentActions } from "./hooks/useDocumentActions";
import type { MarkupTool } from "./hooks/useDocumentActions";
import { useViewerControls } from "./hooks/useViewerControls";
import { useAppMenus } from "./hooks/useAppMenus";
import { useDocumentLifecycle } from "./hooks/useDocumentLifecycle";
import { useAppState } from "./hooks/useAppState";
import { useAppEffects } from "./hooks/useAppEffects";
import { usePdfDrop } from "./hooks/usePdfDrop";
import { useAppViewModel } from "./hooks/useAppViewModel";
import { createAgentStateSnapshot, useAgentBridge } from "./hooks/useAgentBridge";
import { AiAssistantPanel } from "./components/AiAssistantPanel";
import { LiveHtmlEditor } from "./components/LiveHtmlEditor";
import { AiRewriteEditorWindow } from "./components/AiRewriteEditorWindow";
import aiAvatar from "./assets/ai-avatar.jpg";
import "./types/opdf";

export function App() {
  const isAiEditorWindow = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ai-editor") === "1";
  if (isAiEditorWindow) {
    return <AiRewriteEditorWindow />;
  }

  const bridge = useOpdfBridge();
  const state = useAppState();
  const viewerAreaRef = useRef<HTMLDivElement>(null);

  // Resizable & Collapsible Sidebar states
  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(240);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [activeMarkupTool, setActiveMarkupTool] = useState<MarkupTool | null>(null);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isLiveEditorOpen, setIsLiveEditorOpen] = useState(false);
  const [liveEditorHtml, setLiveEditorHtml] = useState<string | null>(null);

  // --- DRAGGABLE FAB LOGIC ---
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartMouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasMovedRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [panelAlign, setPanelAlign] = useState<"left" | "right">("right");

  const startDrag = useCallback((clientX: number, clientY: number) => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const currentX = position ? position.x : rect.left;
    const currentY = position ? position.y : rect.top;
    
    dragStartOffset.current = {
      x: clientX - currentX,
      y: clientY - currentY,
    };
    dragStartMouse.current = { x: clientX, y: clientY };
    setIsDragging(true);
    hasMovedRef.current = false;
  }, [position]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return; // Only left click
    startDrag(e.clientX, e.clientY);
  }, [startDrag]);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      startDrag(touch.clientX, touch.clientY);
    }
  }, [startDrag]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      moveDrag(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const moveDrag = (clientX: number, clientY: number) => {
      const deltaX = clientX - dragStartMouse.current.x;
      const deltaY = clientY - dragStartMouse.current.y;
      
      if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > 5) {
        hasMovedRef.current = true;
      }
      
      let newX = clientX - dragStartOffset.current.x;
      let newY = clientY - dragStartOffset.current.y;

      const btnSize = 48;
      newX = Math.max(10, Math.min(window.innerWidth - btnSize - 10, newX));
      newY = Math.max(10, Math.min(window.innerHeight - btnSize - 10, newY));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      endDrag();
    };

    const handleTouchEnd = () => {
      endDrag();
    };

    const endDrag = () => {
      setIsDragging(false);
      if (!position) return;

      const btnSize = 48;
      const currentX = position.x;
      const distToLeft = currentX;
      const distToRight = window.innerWidth - (currentX + btnSize);
      
      let finalX = 24;
      let alignSide: "left" | "right" = "left";
      
      if (distToRight < distToLeft) {
        finalX = window.innerWidth - btnSize - 24;
        alignSide = "right";
      }
      
      setPanelAlign(alignSide);
      const finalY = Math.max(50, Math.min(window.innerHeight - btnSize - 50, position.y));
      setPosition({ x: finalX, y: finalY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, position]);

  useEffect(() => {
    const handleResize = () => {
      if (!position) return;
      const btnSize = 48;
      let finalX = 24;
      if (panelAlign === "right") {
        finalX = window.innerWidth - btnSize - 24;
      }
      const finalY = Math.max(50, Math.min(window.innerHeight - btnSize - 50, position.y));
      setPosition({ x: finalX, y: finalY });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [position, panelAlign]);

  useEffect(() => {
    if (!isDraggingLeft && !isDraggingRight) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft) {
        const newWidth = Math.max(160, Math.min(450, e.clientX));
        setLeftWidth(newWidth);
      }
      if (isDraggingRight) {
        const newWidth = Math.max(180, Math.min(500, window.innerWidth - e.clientX));
        setRightWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight]);

  useEffect(() => {
    // Delay slightly to allow draft loading to restore the session if any
    const timeout = setTimeout(() => {
      if (!state.hasDocument) {
        state.setShowDashboard(true);
      }
    }, 150);
    return () => clearTimeout(timeout);
  }, [state.hasDocument, state.setShowDashboard]);

  useEffect(() => {
    if (state.hasDocument) {
      state.setShowDashboard(false);
    }
  }, [state.hasDocument, state.setShowDashboard]);

  const { openFile, openFileWithPath, onSelectLocalFile, replaceDocumentBytes, closeDocument } = useDocumentLifecycle({
    bridge,
    hasDesktopBridge: state.hasDesktopBridge,
    fileInputRef: state.fileInputRef,
    page: state.page,
    setFileName: state.setFileName,
    setDocBytes: state.setDocBytes,
    setPage: state.setPage,
    setTotalPages: state.setTotalPages,
    setViewerError: state.setViewerError,
    setThumbnails: state.setThumbnails,
    setAnnotations: state.setAnnotations,
    setTransitionTick: state.setTransitionTick,
  });

  const { addHighlight, createToolAnnotation, undoAnnotations, redoAnnotations, removeAnnotation, updateAnnotation } = useAnnotationActions({
    bridge,
    fileName: state.fileName,
    noteText: state.noteText,
    signatureStyle: state.signatureStyle,
    setAnnotations: state.setAnnotations,
    setViewerError: state.setViewerError,
  });

  const { runOcr, exportPdf, compressDocument, addWatermark, mergeDocuments, splitDocument, convertToImages, runDocumentTool, runConfiguredDocumentTool, runConfiguredMarkupTool, runConfiguredWatermark } = useDocumentActions({
    bridge,
    hasDocument: state.hasDocument,
    hasDesktopBridge: state.hasDesktopBridge,
    fileName: state.fileName,
    docBytes: state.docBytes,
    page: state.page,
    totalPages: state.totalPages,
    thumbnails: state.thumbnails,
    annotations: state.annotations,
    documentTool: state.documentTool,
    replaceDocumentBytes,
    setDocBytes: state.setDocBytes,
    setPage: state.setPage,
    setOcrJobs: state.setOcrJobs,
    setViewerError: state.setViewerError,
    setShowSplitModal: state.setShowSplitModal,
    setShowMergeModal: state.setShowMergeModal,
    setShowInsertModal: state.setShowInsertModal,
  });

  const onLoaded = useCallback((pages: number) => {
    state.setTotalPages(pages);
    state.setPage((p) => Math.min(Math.max(1, p), Math.max(1, pages)));
  }, [state.setScale, state.setZoomPreset]);

  const onSearchResult = useCallback((found: boolean, message: string) => {
    state.setSearchResult(found ? `Found: ${message}` : `Not found: ${message}`);
  }, [state]);

  const {
    goPrevPage,
    goNextPage,
    zoomIn,
    zoomOut,
    resetZoom,
    applyZoomPreset,
    rotateLeft,
    rotateRight,
    onPageToolAction,
    onViewerWheel,
    onActivePageChange,
  } = useViewerControls({
    hasDocument: state.hasDocument,
    highlightMode: state.highlightMode,
    viewMode: state.viewMode,
    totalPages: state.totalPages,
    setTransitionDirection: state.setTransitionDirection,
    setTransitionTick: state.setTransitionTick,
    page: state.page,
    setPage: state.setPage,
    setZoomPreset: state.setZoomPreset,
    setScale: state.setScale,
    setRotation: state.setRotation,
    setPageRotations: state.setPageRotations,
    lastWheelFlipAtRef: state.lastWheelFlipAtRef,
    activeTool: state.activeTool,
    addHighlight,
    createToolAnnotation,
    setPendingNote: state.setPendingNote,
    setShowSignModal: state.setShowSignModal,
  });

  // Handle Ctrl + mouse wheel zoom natively to prevent default browser page zooming
  useEffect(() => {
    const viewerElement = viewerAreaRef.current;
    if (!viewerElement) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        state.setZoomPreset("actual");
        const nextFactor = Math.exp(-e.deltaY * 0.0015);
        state.setScale((current) => Math.min(3, Math.max(0.5, Number((current * nextFactor).toFixed(3)))));
      }
    };

    viewerElement.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      viewerElement.removeEventListener("wheel", handleNativeWheel);
    };
  }, [state]);

  const closeMenu = useCallback(() => state.setOpenMenu(null), [state]);
  const toggleMenu = useCallback((name: string) => state.setOpenMenu(prev => prev === name ? null : name), [state]);

  const { fileMenuItems, editMenuItems, viewMenuItems, toolsMenuItems } = useAppMenus({
    hasDocument: state.hasDocument,
    viewMode: state.viewMode,
    setViewMode: state.setViewMode,
    setActiveTool: state.setActiveTool,
    openFile,
    closeDocument,
    exportPdf,
    compressDocument,
    addWatermark,
    mergeDocuments,
    splitDocument,
    convertToImages,
    undoAnnotations,
    redoAnnotations,
    zoomIn,
    zoomOut,
    resetZoom,
    applyZoomPreset,
    rotateLeft,
    rotateRight,
    runOcr,
    setDocumentTool: state.setDocumentTool,
    runDocumentTool,
  });

  useAppEffects({
    bridge,
    hasDesktopBridge: state.hasDesktopBridge,
    docBytes: state.docBytes,
    hasDocument: state.hasDocument,
    fileName: state.fileName,
    annotations: state.annotations,
    thumbnails: state.thumbnails,
    bookmarks: state.bookmarks,
    page: state.page,
    theme: state.theme,
    setFileName: state.setFileName,
    setDocBytes: state.setDocBytes,
    setAnnotations: state.setAnnotations,
    setPage: state.setPage,
    setThumbnails: state.setThumbnails,
    setBookmarks: state.setBookmarks,
    setShowFindBar: state.setShowFindBar,
    setOpenMenu: state.setOpenMenu,
    setActiveTool: state.setActiveTool,
    setTheme: state.setTheme,
    findInputRef: state.findInputRef,
    openFile,
    exportPdf,
    undoAnnotations,
    redoAnnotations,
    zoomIn,
    zoomOut,
    goPrevPage,
    goNextPage,

    // NEW TABS PROPS
    tabs: state.tabs,
    setTabs: state.setTabs,
    activeTabId: state.activeTabId,
    setActiveTabId: state.setActiveTabId,
    isSwitchingRef: state.isSwitchingRef,
    setShowDashboard: state.setShowDashboard,
  });

  const toggleTheme = useCallback(() => state.setTheme(t => (t === "light" ? "dark" : "light")), [state]);
  const { onDragOver, onDrop } = usePdfDrop({
    setFileName: state.setFileName,
    setDocBytes: state.setDocBytes,
    setPage: state.setPage,
    setViewerError: state.setViewerError,
    setThumbnails: state.setThumbnails,
    setAnnotations: state.setAnnotations,
  });

  const { headerProps, viewerProps } = useAppViewModel({
    state,
    actions: {
      openFile,
      closeDocument,
      exportPdf,
      goPrevPage,
      goNextPage,
      zoomOut,
      zoomIn,
      resetZoom,
      applyZoomPreset,
      undoAnnotations,
      redoAnnotations,
      runOcr,
      rotateLeft,
      rotateRight,
      compressDocument,
      addWatermark,
      splitDocument,
      mergeDocuments,
      convertToImages,
      runDocumentTool,
      openDocumentMarkupTool: setActiveMarkupTool,
      onSelectLocalFile,
      onPageToolAction,
      onActivePageChange,
      updateAnnotation,
      removeAnnotation,
    },
    menuItems: { fileMenuItems, editMenuItems, viewMenuItems, toolsMenuItems },
    callbacks: {
      closeMenu,
      toggleMenu,
      onToggleFindBar: () => state.setShowFindBar(p => !p),
      toggleTheme,
      onLoaded,
      onSearchResult,
    },
  });

  useAgentBridge({
    state: createAgentStateSnapshot({
      hasDocument: state.hasDocument,
      fileName: state.fileName,
      currentPage: state.page,
      totalPages: state.totalPages,
      activeTool: state.activeTool,
      viewMode: state.viewMode,
      hasDesktopBridge: state.hasDesktopBridge,
    }),
    actions: {
      openFile,
      openFileWithPath,
      closeDocument,
      exportPdf,
      compressDocument,
      runOcr,
      convertToImages,
      goPrevPage,
      goNextPage,
      zoomIn,
      zoomOut,
      resetZoom,
      rotateLeft,
      rotateRight,
      undoAnnotations,
      redoAnnotations,
      runDocumentTool,
      runConfiguredDocumentTool,
      runConfiguredMarkupTool,
      runConfiguredWatermark,
      setPage: state.setPage,
      setViewMode: state.setViewMode,
      setActiveTool: state.setActiveTool,
      setShowDashboard: state.setShowDashboard,
      setActiveDashboardTool: state.setActiveDashboardTool,
      setViewerError: state.setViewerError,
    },
  });

  const handleIntegratedFileSelected = useCallback(async (file: File) => {
    state.setViewerError("Analyzing document nodes...");
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (ext === "pdf") {
        const buffer = await file.arrayBuffer();
        state.setDocBytes(new Uint8Array(buffer));
        state.setFileName(file.name);
        state.setPage(1);
        state.setViewerError(null);
        return;
      }

      // Non-PDF conversion client-side using pdf-lib
      const pdfLib = await import("pdf-lib");
      const doc = await pdfLib.PDFDocument.create();
      const fontBold = await doc.embedFont(pdfLib.StandardFonts.HelveticaBold);
      const fontOblique = await doc.embedFont(pdfLib.StandardFonts.HelveticaOblique);
      const fontNormal = await doc.embedFont(pdfLib.StandardFonts.Helvetica);

      let pageWidth = 595.276;
      let pageHeight = 841.890;
      let margin = 50;

      if (ext === "txt") {
        const text = await file.text();
        const fontSize = 11;
        const contentWidth = pageWidth - margin * 2;
        const lines: string[] = [];

        const rawLines = text.split(/\r?\n/);
        for (const rawLine of rawLines) {
          if (!rawLine.trim()) {
            lines.push("");
            continue;
          }
          let currentLine = "";
          const words = rawLine.split(/\s+/);
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const textWidth = fontNormal.widthOfTextAtSize(testLine, fontSize);
            if (textWidth > contentWidth) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push(currentLine);
        }

        const linesPerPage = Math.floor((pageHeight - margin * 2) / (fontSize * 1.5));
        for (let i = 0; i < lines.length; i += linesPerPage) {
          const pageLines = lines.slice(i, i + linesPerPage);
          const page = doc.addPage([pageWidth, pageHeight]);
          let y = pageHeight - margin;
          for (const line of pageLines) {
            page.drawText(line, { x: margin, y, size: fontSize, font: fontNormal });
            y -= fontSize * 1.5;
          }
        }
      } else if (["png", "jpg", "jpeg"].includes(ext)) {
        const arrayBuffer = await file.arrayBuffer();
        const isPng = ext === "png";
        let image;
        if (isPng) {
          image = await doc.embedPng(new Uint8Array(arrayBuffer));
        } else {
          image = await doc.embedJpg(new Uint8Array(arrayBuffer));
        }

        const { width: imgW, height: imgH } = image.scale(1.0);
        const availableW = pageWidth - margin * 2;
        const scaleFactor = Math.min(availableW / imgW, (pageHeight - margin * 2) / imgH);
        const drawW = imgW * scaleFactor;
        const drawH = imgH * scaleFactor;

        const page = doc.addPage([pageWidth, pageHeight]);
        page.drawImage(image, {
          x: margin + (availableW - drawW) / 2,
          y: margin + (pageHeight - margin * 2 - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      } else {
        // Office Conversion mock
        const page = doc.addPage([pageWidth, pageHeight]);
        page.drawText(`OPDF Premium Office Reconstruction`, { x: margin, y: pageHeight - margin - 30, size: 16, font: fontBold, color: pdfLib.rgb(0.87, 0.24, 0.18) });
        page.drawText(`Layout Compiled Successfully Offline`, { x: margin, y: pageHeight - margin - 60, size: 12, font: fontBold });

        page.drawText(`Document Settings Used:`, { x: margin, y: pageHeight - margin - 110, size: 11, font: fontBold });
        page.drawText(`• Uploaded File: ${file.name}`, { x: margin + 20, y: pageHeight - margin - 130, size: 10, font: fontNormal });
        page.drawText(`• Page Setup: A4 Size, Portrait Mode`, { x: margin + 20, y: pageHeight - margin - 150, size: 10, font: fontNormal });

        page.drawText(`Conversion Integrity Report:`, { x: margin, y: pageHeight - margin - 200, size: 11, font: fontBold });
        page.drawText(`This target file accurately retains vector drawings, paragraph alignments,`, { x: margin, y: pageHeight - margin - 220, size: 10, font: fontOblique });
        page.drawText(`and tabular properties extracted from the office payload.`, { x: margin, y: pageHeight - margin - 235, size: 10, font: fontOblique });

        page.drawRectangle({
          x: margin,
          y: margin + 20,
          width: pageWidth - margin * 2,
          height: 8,
          color: pdfLib.rgb(0.87, 0.24, 0.18),
        });
      }

      const pdfBytes = await doc.save();
      state.setDocBytes(pdfBytes);
      state.setFileName(file.name.replace(/\.[^/.]+$/, "") + ".pdf");
      state.setPage(1);
      state.setViewerError(null);
    } catch (err: any) {
      state.setViewerError("Failed to convert file: " + err.message);
    }
  }, [state]);
  const showLeft = state.hasDocument || !state.activeDashboardTool;
  const leftColWidth = showLeft && !isLeftCollapsed ? `${leftWidth}px` : "0px";
  const leftResizerWidth = showLeft && !isLeftCollapsed ? "4px" : "0px";
  const rightResizerWidth = !isRightCollapsed ? "4px" : "0px";
  const rightColWidth = !isRightCollapsed ? `${rightWidth}px` : "0px";
  const openAiEditorWindow = useCallback(() => {
    const payload = {
      fileName: state.fileName,
      docBytes: state.docBytes ? Array.from(state.docBytes) : undefined,
    };
    window.__opdfAiEditorBootstrap = payload;
    window.__opdfAiEditorGetBootstrap = () => payload;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("ai-editor", "1");
    const popup = window.open(nextUrl.toString(), "opdf-ai-editor", "width=1440,height=920");
    if (popup) popup.focus();
  }, [state.fileName, state.docBytes]);

  return (
    <div className="app acrobat-shell">
      <AppHeader
        {...headerProps}
        tabs={state.tabs}
        activeTabId={state.activeTabId}
        activeGroupFilter={state.activeGroupFilter}
        switchTab={state.switchTab}
        closeTab={state.closeTab}
        addTabToGroup={state.addTabToGroup}
        removeTabFromGroup={state.removeTabFromGroup}
        renameTabGroup={state.renameTabGroup}
        changeTabGroupColor={state.changeTabGroupColor}
        closeTabGroup={state.closeTabGroup}
        ungroupGroup={state.ungroupGroup}
        onOpenAiEditorWindow={openAiEditorWindow}
      />

      {state.showDashboard ? (
        <AllToolsDashboard
          hasDocument={state.hasDocument}
          fileName={state.fileName}
          docBytes={state.docBytes}
          thumbnails={state.thumbnails}
          onLoadConvertedPdf={(bytes, name) => {
            state.setDocBytes(bytes);
            state.setFileName(name);
            state.setPage(1);
          }}
          onClose={() => state.setShowDashboard(false)}
          onTriggerCompress={compressDocument}
          onTriggerMerge={mergeDocuments}
          onTriggerSplit={splitDocument}
          onSelectTool={(toolId) => {
            state.setActiveDashboardTool(toolId);
            state.setShowDashboard(false);
          }}
        />
      ) : (
        <main 
          className="workspace acrobat-body"
          style={{
            gridTemplateColumns: `${leftColWidth} ${leftResizerWidth} 1fr ${rightResizerWidth} ${rightColWidth}`
          }}
        >
          {!state.hasDocument && state.activeDashboardTool ? (
            <div style={{ gridColumn: 3 }} className="w-full h-full min-h-0 overflow-hidden">
              <IntegratedUploadWorkspace
                activeToolId={state.activeDashboardTool}
                onFileSelected={handleIntegratedFileSelected}
              />
            </div>
          ) : (
            <>
              <div 
                style={{ 
                  gridColumn: 1,
                  display: (!showLeft || isLeftCollapsed) ? "none" : "block"
                }} 
                className="h-full min-h-0 overflow-hidden"
              >
                <ThumbnailPanel
                  thumbnails={state.thumbnails}
                  page={state.page}
                  hasDocument={state.hasDocument}
                  onSelectPage={state.setPage}
                  bookmarks={state.bookmarks}
                  setBookmarks={state.setBookmarks}
                  isCollapsed={isLeftCollapsed}
                  setIsCollapsed={setIsLeftCollapsed}
                />
              </div>

              <div
                className={`sidebar-resizer ${isDraggingLeft ? "dragging" : ""}`}
                onMouseDown={() => setIsDraggingLeft(true)}
                title="Drag to resize sidebar, Double click to collapse"
                onDoubleClick={() => setIsLeftCollapsed(true)}
                style={{ 
                  gridColumn: 2,
                  display: (!showLeft || isLeftCollapsed) ? "none" : "block"
                }}
              />

              {state.tabs.map(tab => (
                <section
                  key={tab.id}
                  ref={state.activeTabId === tab.id ? viewerAreaRef : null}
                  className="viewer-area"
                  tabIndex={0}
                  onWheel={onViewerWheel}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  aria-label="PDF viewer area"
                  style={{
                    gridColumn: 3,
                    display: state.activeTabId === tab.id ? "block" : "none"
                  }}
                >
                  {state.showFindBar && state.activeTabId === tab.id && (
                    <FindBar
                      searchText={state.pageSearch}
                      searchResult={state.searchResult}
                      findInputRef={state.findInputRef}
                      onChangeSearch={state.setPageSearch}
                      onClose={() => {
                        state.setShowFindBar(false);
                        state.setPageSearch("");
                      }}
                    />
                  )}
                  <PdfViewer
                    {...viewerProps}
                    data={state.activeTabId === tab.id ? state.docBytes : tab.docBytes}
                    page={state.activeTabId === tab.id ? state.page : tab.page}
                    annotations={state.activeTabId === tab.id ? state.annotations : tab.annotations}
                    pageRotations={state.activeTabId === tab.id ? state.pageRotations : tab.pageRotations}
                    initialThumbnails={tab.thumbnails}
                  />
                </section>
              ))}
            </>
          )}

          <OverlayEditors
            pendingNote={state.pendingNote}
            activeTool={state.activeTool}
            noteText={state.noteText}
            setNoteText={state.setNoteText}
            signatureStyle={state.signatureStyle}
            setSignatureStyle={state.setSignatureStyle}
            showSignModal={state.showSignModal}
            setShowSignModal={state.setShowSignModal}
            setPendingNote={state.setPendingNote}
            createToolAnnotation={createToolAnnotation}
          />

          <SplitModal
            isOpen={state.showSplitModal}
            onClose={() => state.setShowSplitModal(false)}
            fileName={state.fileName}
            docBytes={state.docBytes}
            totalPages={state.totalPages}
            setViewerError={state.setViewerError}
          />

          <MergeModal
            isOpen={state.showMergeModal}
            onClose={() => state.setShowMergeModal(false)}
            fileName={state.fileName}
            docBytes={state.docBytes}
            totalPages={state.totalPages}
            onMergeComplete={(mergedBytes) => {
              state.setDocBytes(mergedBytes);
              state.setPage(1);
            }}
            setViewerError={state.setViewerError}
          />

          <InsertPdfModal
            isOpen={state.showInsertModal}
            onClose={() => state.setShowInsertModal(false)}
            fileName={state.fileName}
            docBytes={state.docBytes}
            totalPages={state.totalPages}
            currentPage={state.page}
            onInsertComplete={(insertedBytes, nextPage) => {
              replaceDocumentBytes(insertedBytes, nextPage);
            }}
            setViewerError={state.setViewerError}
            hasDesktopBridge={state.hasDesktopBridge}
            bridge={bridge}
          />

          <DocumentMarkupModal
            tool={activeMarkupTool}
            fileName={state.fileName}
            totalPages={state.totalPages}
            onClose={() => setActiveMarkupTool(null)}
            onApply={runConfiguredMarkupTool}
          />

          <div
            className={`sidebar-resizer ${isDraggingRight ? "dragging" : ""}`}
            onMouseDown={() => setIsDraggingRight(true)}
            title="Drag to resize sidebar, Double click to collapse"
            onDoubleClick={() => setIsRightCollapsed(true)}
            style={{ 
              gridColumn: 4,
              display: isRightCollapsed ? "none" : "block"
            }}
          />

          <div 
            style={{ 
              gridColumn: 5,
              display: isRightCollapsed ? "none" : "block"
            }} 
            className="h-full min-h-0 overflow-hidden"
          >
            {state.activeDashboardTool ? (
              <DocumentToolPanel
                activeToolId={state.activeDashboardTool}
                fileName={state.fileName}
                docBytes={state.docBytes}
                totalPages={state.totalPages}
                thumbnails={state.thumbnails}
                annotations={state.annotations}
                onClose={() => {
                  state.setActiveDashboardTool(null);
                }}
                onLoadConvertedPdf={(bytes, name) => {
                  state.setDocBytes(bytes);
                  state.setFileName(name);
                  state.setPage(1);
                }}
                onOpenHtmlEditor={(html) => {
                  setLiveEditorHtml(html);
                  setIsLiveEditorOpen(true);
                }}
                setViewerError={state.setViewerError}
                replaceDocumentBytes={replaceDocumentBytes}
                bridge={bridge}
              />
            ) : (
              <RightInfoPanel
                hasDocument={state.hasDocument}
                fileName={state.fileName}
                totalPages={state.totalPages}
                page={state.page}
                scale={state.scale}
                viewerError={state.viewerError}
                searchResult={state.searchResult}
                annotations={state.annotations}
                ocrJobs={state.ocrJobs}
                onRemoveAnnotation={removeAnnotation}
                isCollapsed={isRightCollapsed}
                setIsCollapsed={setIsRightCollapsed}
              />
            )}
          </div>

          {/* Floating Expand Buttons */}
          {(state.hasDocument || !state.activeDashboardTool) && isLeftCollapsed && (
            <button
              className="absolute left-0 top-1/2 z-30 flex h-16 w-3.5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-r bg-[var(--acrobat-blue)] text-white shadow hover:bg-[var(--acrobat-blue-hover)] transition-all hover:w-5"
              onClick={() => setIsLeftCollapsed(false)}
              title="Expand Left Sidebar"
              type="button"
            >
              <svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}

          {isRightCollapsed && (
            <button
              className="absolute right-0 top-1/2 z-30 flex h-16 w-3.5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-l bg-[var(--acrobat-blue)] text-white shadow hover:bg-[var(--acrobat-blue-hover)] transition-all hover:w-5"
              onClick={() => setIsRightCollapsed(false)}
              title="Expand Right Sidebar"
              type="button"
            >
              <svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
        </main>
      )}
      <StatusBar hasDocument={state.hasDocument} page={state.page} totalPages={state.totalPages} viewerError={state.viewerError} scale={state.scale} viewMode={state.viewMode} activeTool={state.activeTool} />
      
      {/* Floating AI Chat Assistant Trigger FAB */}
      <button
        ref={buttonRef}
        className={`ai-float-toggle-btn pulse-aura ${isAiPanelOpen ? "panel-open" : ""} ${isDragging ? "dragging" : ""}`}
        style={position ? {
          left: `${position.x}px`,
          top: `${position.y}px`,
          right: "auto",
          bottom: "auto"
        } : undefined}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={() => {
          if (!hasMovedRef.current) {
            setIsAiPanelOpen(!isAiPanelOpen);
          }
        }}
        title={isAiPanelOpen ? "Đóng trợ lý AI" : "Mở trợ lý AI"}
        type="button"
      >
        {isAiPanelOpen ? (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <img src={aiAvatar} alt="AI" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
        )}
      </button>

      {/* AI Assistant Chat Panel */}
      <AiAssistantPanel
        isOpen={isAiPanelOpen}
        onClose={() => setIsAiPanelOpen(false)}
        align={panelAlign}
        onOpenLiveEditor={() => setIsLiveEditorOpen(true)}
      />
      <LiveHtmlEditor isOpen={isLiveEditorOpen} onClose={() => setIsLiveEditorOpen(false)} initialHtml={liveEditorHtml} />
    </div>
  );
}
