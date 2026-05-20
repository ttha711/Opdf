import { useMemo } from "react";
import type { OpdfBridge } from "../types/opdf";
import { createMockBridge } from "./opdf-bridge/mockBridge";

export function useOpdfBridge(): OpdfBridge {
  return useMemo(() => window.opdf ?? createMockBridge(), []);
}
