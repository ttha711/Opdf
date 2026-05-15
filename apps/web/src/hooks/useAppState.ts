import { useMemo, useRef, useState } from "react";
import type { Annotation, OcrJob } from "@opdf/core";
import type { ActiveTool, PendingNote, ViewMode, ZoomPreset } from "../lib/app-types";
import type { DocumentTool } from "../lib/document-tools";

export function useAppState() {
  const [fileName, setFileName] = useState("");
  const [docBytes, setDocBytes] = useState<Uint8Array | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [ocrJobs, setOcrJobs] = useState<OcrJob[]>([]);
  const [pageSearch, setPageSearch] = useState("");
  const [searchResult, setSearchResult] = useState("");
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [zoomPreset, setZoomPreset] = useState<ZoomPreset>("actual");
  const [pendingNote, setPendingNote] = useState<PendingNote>(null);
  const [noteText, setNoteText] = useState("New note");
  const [showSignModal, setShowSignModal] = useState(false);
  const [signatureStyle, setSignatureStyle] = useState("User Signature");
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("continuous");
  const [documentTool, setDocumentTool] = useState<DocumentTool>("delete-pages");
  const [transitionTick, setTransitionTick] = useState(0);
  const [transitionDirection, setTransitionDirection] = useState<"next" | "prev">("next");
  const [thumbnails, setThumbnails] = useState<Array<{ page: number; url: string; blob: Blob }>>([]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showFindBar, setShowFindBar] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("opdf-theme") as "light" | "dark") || "light";
    }
    return "light";
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const lastWheelFlipAtRef = useRef(0);

  const hasDocument = useMemo(() => Boolean(fileName && docBytes), [fileName, docBytes]);
  const highlightMode = activeTool === "highlight";
  const hasDesktopBridge = typeof window !== "undefined" && Boolean(window.opdf);

  return {
    fileName, setFileName, docBytes, setDocBytes, page, setPage, totalPages, setTotalPages, scale, setScale, rotation, setRotation,
    annotations, setAnnotations, ocrJobs, setOcrJobs, pageSearch, setPageSearch, searchResult, setSearchResult, activeTool, setActiveTool,
    zoomPreset, setZoomPreset, pendingNote, setPendingNote, noteText, setNoteText, showSignModal, setShowSignModal,
    signatureStyle, setSignatureStyle, viewerError, setViewerError, viewMode, setViewMode, documentTool, setDocumentTool,
    transitionTick, setTransitionTick, transitionDirection, setTransitionDirection, thumbnails, setThumbnails, openMenu, setOpenMenu,
    showFindBar, setShowFindBar, theme, setTheme, fileInputRef, findInputRef, lastWheelFlipAtRef, hasDocument, highlightMode, hasDesktopBridge,
  };
}
