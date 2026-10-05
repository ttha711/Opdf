import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { ActiveTool } from "../lib/app-types";
import { getViewerControls } from "../lib/viewer-runtime";

type Args = {
  openFile: () => void;
  savePdf: () => void;
  savePdfAs: () => void;
  undoAnnotations: () => Promise<void>;
  redoAnnotations: () => Promise<void>;
  zoomIn: () => void;
  zoomOut: () => void;
  goPrevPage: () => void;
  goNextPage: () => void;
  setActiveTool: (tool: ActiveTool) => void;
  setOpenMenu: Dispatch<SetStateAction<string | null>>;
  setTheme: Dispatch<SetStateAction<"light" | "dark">>;
};

export function useGlobalKeyboardShortcuts(args: Args) {
  const { openFile, savePdf, savePdfAs, undoAnnotations, redoAnnotations, zoomIn, zoomOut, goPrevPage, goNextPage, setActiveTool, setOpenMenu, setTheme } = args;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement;
      const inInput = target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (command && key === "o") {
        event.preventDefault();
        openFile();
        return;
      }
      if (command && key === "s" && !event.shiftKey) {
        event.preventDefault();
        savePdf();
        return;
      }
      if (command && event.shiftKey && key === "s") {
        event.preventDefault();
        savePdfAs();
        return;
      }
      if (command && key === "z") {
        if (getViewerControls()) return;
        event.preventDefault();
        void undoAnnotations();
        return;
      }
      if (command && (key === "y" || (event.shiftKey && key === "z"))) {
        if (getViewerControls()) return;
        event.preventDefault();
        void redoAnnotations();
        return;
      }
      if (command && event.shiftKey && key === "l") {
        event.preventDefault();
        setTheme((theme) => theme === "light" ? "dark" : "light");
        return;
      }

      // Never reinterpret modified keys as single-key tool shortcuts.
      if (command || event.altKey || inInput) return;

      if (event.key === "+" || event.key === "=") return zoomIn();
      if (event.key === "-") return zoomOut();

      // Native Edit PDF owns arrows and tool-like single keys while it is active.
      if (document.querySelector("[data-opdf-native-editor='true']")) return;

      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        goPrevPage();
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        goNextPage();
        return;
      }
      if (event.key === "Escape") setOpenMenu(null);
      if (key === "v") return setActiveTool("select");
      if (key === "i") return setActiveTool("highlight");
      if (key === "t") return setActiveTool("note");
      if (key === "r") return setActiveTool("redact");
      if (key === "s") return setActiveTool("signature");
      if (key === "q") return setActiveTool("shape");
      if (key === "m") return setActiveTool("measure");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNextPage, goPrevPage, openFile, redoAnnotations, savePdf, savePdfAs, setActiveTool, setOpenMenu, setTheme, undoAnnotations, zoomIn, zoomOut]);
}
