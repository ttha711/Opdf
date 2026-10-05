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
        args.openFile();
        return;
      }
      if (command && key === "s" && !event.shiftKey) {
        event.preventDefault();
        args.savePdf();
        return;
      }
      if (command && event.shiftKey && key === "s") {
        event.preventDefault();
        args.savePdfAs();
        return;
      }
      if (command && key === "z") {
        if (getViewerControls()) return;
        event.preventDefault();
        void args.undoAnnotations();
        return;
      }
      if (command && (key === "y" || (event.shiftKey && key === "z"))) {
        if (getViewerControls()) return;
        event.preventDefault();
        void args.redoAnnotations();
        return;
      }
      if (command && event.shiftKey && key === "l") {
        event.preventDefault();
        args.setTheme((theme) => theme === "light" ? "dark" : "light");
        return;
      }

      // Never reinterpret modified keys as single-key tool shortcuts.
      if (command || event.altKey || inInput) return;

      if (event.key === "+" || event.key === "=") return args.zoomIn();
      if (event.key === "-") return args.zoomOut();
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        args.goPrevPage();
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        args.goNextPage();
        return;
      }
      if (event.key === "Escape") args.setOpenMenu(null);
      if (key === "v") return args.setActiveTool("select");
      if (key === "i") return args.setActiveTool("highlight");
      if (key === "t") return args.setActiveTool("note");
      if (key === "r") return args.setActiveTool("redact");
      if (key === "s") return args.setActiveTool("signature");
      if (key === "q") return args.setActiveTool("shape");
      if (key === "m") return args.setActiveTool("measure");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [args]);
}
