import { useMemo } from "react";
import type { OpdfBridge } from "../types/opdf";
import { createMockBridge } from "./opdf-bridge/mockBridge";
import { createServerBridge } from "./opdf-bridge/serverBridge";

export function isOpdfServerRuntime() {
  return typeof window !== "undefined" && window.__OPDF_RUNTIME__ === "server";
}

export function useOpdfBridge(): OpdfBridge {
  return useMemo(() => {
    if (window.opdf) return window.opdf;
    if (isOpdfServerRuntime()) {
      return createServerBridge(window.__OPDF_SERVER_BASE__ || "/api/opdf");
    }
    return createMockBridge();
  }, []);
}
