import { useMemo } from "react";
import type { TpdfBridge } from "../types/tpdf";
import { createMockBridge } from "./tpdf-bridge/mockBridge";
import { createServerBridge } from "./tpdf-bridge/serverBridge";

export function isTpdfServerRuntime() {
  return typeof window !== "undefined" && window.__TPDF_RUNTIME__ === "server";
}

export function useTpdfBridge(): TpdfBridge {
  return useMemo(() => {
    if (window.tpdf) return window.tpdf;
    if (isTpdfServerRuntime()) {
      return createServerBridge(window.__TPDF_SERVER_BASE__ || "/api/tpdf");
    }
    return createMockBridge();
  }, []);
}
