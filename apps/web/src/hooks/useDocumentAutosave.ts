import { useCallback, useEffect, useRef, useState } from "react";

type SaveState = "idle" | "saving" | "saved";
export type AutosaveStatus = "idle" | "offline" | "retrying";

type AutosaveArgs = {
  hasDocument: boolean;
  saveState: SaveState;
  docBytes: Uint8Array | null;
  annotations: unknown[];
  sourceIdentity: string;
  savePdf: (options?: { silent?: boolean }) => boolean | void | Promise<boolean | void>;
  delayMs?: number;
};

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000];

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
  const failureCountRef = useRef(0);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");

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

  const schedule = useCallback((fromMutation = false, immediate = false) => {
    cancel();

    if (fromMutation) {
      failureCountRef.current = 0;
      setAutosaveStatus(navigator.onLine ? "idle" : "offline");
    }

    if (
      savingRef.current ||
      !stateRef.current.hasDocument ||
      (!fromMutation && stateRef.current.saveState !== "idle")
    ) {
      return;
    }

    if (!navigator.onLine) {
      setAutosaveStatus("offline");
      return;
    }

    const retryIndex = Math.max(0, Math.min(failureCountRef.current - 1, RETRY_DELAYS_MS.length - 1));
    const waitMs = immediate
      ? 0
      : failureCountRef.current > 0
        ? RETRY_DELAYS_MS[retryIndex]
        : delayMs;

    if (failureCountRef.current > 0) setAutosaveStatus("retrying");

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (
        savingRef.current ||
        !stateRef.current.hasDocument ||
        stateRef.current.saveState !== "idle"
      ) {
        return;
      }

      if (!navigator.onLine) {
        setAutosaveStatus("offline");
        return;
      }

      savingRef.current = true;
      void Promise.resolve(savePdfRef.current({ silent: true }))
        .then((result) => {
          if (result === false) {
            failureCountRef.current += 1;
            setAutosaveStatus(navigator.onLine ? "retrying" : "offline");
            return;
          }
          failureCountRef.current = 0;
          setAutosaveStatus("idle");
        })
        .catch(() => {
          failureCountRef.current += 1;
          setAutosaveStatus(navigator.onLine ? "retrying" : "offline");
        })
        .finally(() => {
          savingRef.current = false;
          if (
            failureCountRef.current > 0 &&
            stateRef.current.hasDocument &&
            stateRef.current.saveState === "idle" &&
            navigator.onLine
          ) {
            schedule(false);
          }
        });
    }, waitMs);
  }, [cancel, delayMs]);

  useEffect(() => {
    if (!hasDocument || saveState !== "idle") {
      cancel();
      if (saveState === "saved") {
        failureCountRef.current = 0;
        setAutosaveStatus("idle");
      }
      return;
    }
    schedule(false);
    return cancel;
  }, [cancel, hasDocument, saveState, schedule]);

  useEffect(() => {
    if (!hasDocument) return;
    schedule(true);
  }, [annotations, docBytes, hasDocument, schedule, sourceIdentity]);

  useEffect(() => {
    const handleOffline = () => {
      if (!stateRef.current.hasDocument || stateRef.current.saveState !== "idle") return;
      cancel();
      setAutosaveStatus("offline");
    };
    const handleOnline = () => {
      if (!stateRef.current.hasDocument || stateRef.current.saveState !== "idle") {
        setAutosaveStatus("idle");
        return;
      }
      setAutosaveStatus(failureCountRef.current > 0 ? "retrying" : "idle");
      schedule(false, true);
    };
    const handleVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        stateRef.current.hasDocument &&
        stateRef.current.saveState === "idle"
      ) {
        schedule(false, true);
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [cancel, schedule]);

  useEffect(() => cancel, [cancel]);

  return {
    autosaveEnabled: true,
    autosaveStatus,
    scheduleAutosave: schedule,
  };
}
