import { useCallback, useEffect, useRef } from "react";

type SaveState = "idle" | "saving" | "saved";

type AutosaveArgs = {
  hasDocument: boolean;
  saveState: SaveState;
  docBytes: Uint8Array | null;
  annotations: unknown[];
  sourceIdentity: string;
  savePdf: (options?: { silent?: boolean }) => boolean | void | Promise<boolean | void>;
  delayMs?: number;
};

export function useDocumentAutosave({
  hasDocument,
  saveState,
  docBytes,
  annotations,
  sourceIdentity,
  savePdf,
  delayMs = 1800,
}: AutosaveArgs) {
  const timerRef = useRef<number | null>(null);
  const savePdfRef = useRef(savePdf);
  const stateRef = useRef({ hasDocument, saveState });
  const savingRef = useRef(false);
  const blockedAfterFailureRef = useRef(false);

  useEffect(() => {
    savePdfRef.current = savePdf;
  }, [savePdf]);

  useEffect(() => {
    stateRef.current = { hasDocument, saveState };
  }, [hasDocument, saveState]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedule = useCallback((fromMutation = false) => {
    cancel();
    if (fromMutation) blockedAfterFailureRef.current = false;
    if (
      blockedAfterFailureRef.current ||
      savingRef.current ||
      !stateRef.current.hasDocument ||
      stateRef.current.saveState !== "idle"
    ) return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (
        blockedAfterFailureRef.current ||
        savingRef.current ||
        !stateRef.current.hasDocument ||
        stateRef.current.saveState !== "idle"
      ) return;

      savingRef.current = true;
      void Promise.resolve(savePdfRef.current({ silent: true }))
        .then((result) => {
          if (result === false) blockedAfterFailureRef.current = true;
        })
        .finally(() => {
          savingRef.current = false;
        });
    }, delayMs);
  }, [cancel, delayMs]);

  useEffect(() => {
    if (!hasDocument || saveState !== "idle") {
      cancel();
      return;
    }
    schedule(false);
    return cancel;
  }, [cancel, hasDocument, saveState, schedule]);

  useEffect(() => {
    if (!hasDocument || saveState !== "idle") return;
    schedule(true);
  }, [annotations, docBytes, hasDocument, saveState, schedule, sourceIdentity]);

  useEffect(() => cancel, [cancel]);

  return {
    autosaveEnabled: true,
    scheduleAutosave: schedule,
  };
}
