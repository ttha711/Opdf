import { useEffect, useRef } from "react";
import type { PdfMatrix } from "@opdf/core";
import { translationMatrix } from "../../lib/nativeEditGeometry";
import { applyNativeEditPatches } from "../../lib/nativeEditRuntime";

type KeyboardMove = {
  dx: number;
  dy: number;
  startedAt: number;
};

type Props = {
  objectId: string | null;
  enabled: boolean;
  setPreviewMatrix: (matrix: PdfMatrix | null) => void;
  setError: (message: string | null) => void;
};

const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

export function nativeEditKeyboardStep(elapsedMs: number, shiftKey = false) {
  const accelerated = elapsedMs >= 1_600 ? 8 :
    elapsedMs >= 900 ? 4 :
    elapsedMs >= 400 ? 2 : 1;
  return accelerated * (shiftKey ? 5 : 1);
}

export function useNativeEditKeyboardMove({
  objectId,
  enabled,
  setPreviewMatrix,
  setError,
}: Props) {
  const moveRef = useRef<KeyboardMove | null>(null);

  useEffect(() => {
    const commit = () => {
      const move = moveRef.current;
      moveRef.current = null;
      setPreviewMatrix(null);
      if (!objectId || !move || (move.dx === 0 && move.dy === 0)) return;
      void applyNativeEditPatches(
        [{
          type: "relative-transform",
          objectId,
          matrix: translationMatrix(move.dx, move.dy),
        }],
        "Object moved with keyboard.",
      ).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!enabled || !objectId || !ARROWS.has(event.key)) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;

      event.preventDefault();
      const now = performance.now();
      const current = moveRef.current ?? { dx: 0, dy: 0, startedAt: now };
      const step = nativeEditKeyboardStep(now - current.startedAt, event.shiftKey);

      if (event.key === "ArrowLeft") current.dx -= step;
      if (event.key === "ArrowRight") current.dx += step;
      if (event.key === "ArrowUp") current.dy += step;
      if (event.key === "ArrowDown") current.dy -= step;

      moveRef.current = current;
      setPreviewMatrix(translationMatrix(current.dx, current.dy));
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!ARROWS.has(event.key) || !moveRef.current) return;
      event.preventDefault();
      commit();
    };

    const onBlur = () => commit();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled, objectId, setError, setPreviewMatrix]);
}
