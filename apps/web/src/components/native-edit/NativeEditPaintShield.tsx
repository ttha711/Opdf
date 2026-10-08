import { useEffect, useLayoutEffect, useRef } from "react";

// Keep the last raster visible while EmbedPDF swaps document revisions. The
// document manager closes the old PDF before the replacement canvas paints,
// which otherwise exposes a white page during every inline text commit.
export function NativeEditPaintShield({
  revisionKey,
  activeDocumentId,
}: {
  revisionKey: string;
  activeDocumentId: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastRevisionRef = useRef(revisionKey);
  const oldDocumentRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (revisionKey === lastRevisionRef.current) return;
    lastRevisionRef.current = revisionKey;
    const cover = ref.current;
    const surface = cover?.parentElement;
    const viewport = surface?.querySelector(".native-edit-viewport");
    if (!cover || !surface || !viewport) return;
    const canvases = viewport.querySelectorAll<HTMLCanvasElement>(".native-edit-page canvas");
    if (canvases.length === 0) return;

    const rect = surface.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const snapshot = document.createElement("canvas");
    snapshot.width = Math.ceil(rect.width * scale);
    snapshot.height = Math.ceil(rect.height * scale);
    const context = snapshot.getContext("2d");
    if (!context) return;
    context.scale(scale, scale);
    context.fillStyle = getComputedStyle(viewport).backgroundColor || "#e8eaed";
    context.fillRect(0, 0, rect.width, rect.height);

    let painted = false;
    for (const page of viewport.querySelectorAll<HTMLElement>(".native-edit-page")) {
      const bounds = page.getBoundingClientRect();
      context.fillStyle = "#fff";
      context.fillRect(bounds.left - rect.left, bounds.top - rect.top, bounds.width, bounds.height);
    }
    for (const canvas of canvases) {
      if (!canvas.width || !canvas.height) continue;
      const bounds = canvas.getBoundingClientRect();
      try {
        context.drawImage(canvas, bounds.left - rect.left, bounds.top - rect.top, bounds.width, bounds.height);
        painted = true;
      } catch {
        // A stale canvas may already have been disposed. Never block the editor.
      }
    }
    if (!painted) return;
    snapshot.style.width = "100%";
    snapshot.style.height = "100%";
    cover.replaceChildren(snapshot);
    cover.style.display = "block";
    oldDocumentRef.current = activeDocumentId;
  }, [revisionKey, activeDocumentId]);

  useEffect(() => {
    const cover = ref.current;
    const previous = oldDocumentRef.current;
    if (!cover || previous === null || !activeDocumentId || previous === activeDocumentId) return;
    let frame = 0;
    let stableFrames = 0;
    const started = performance.now();
    let cancelled = false;
    const check = () => {
      if (cancelled) return;
      const canvas = cover.parentElement?.querySelector<HTMLCanvasElement>(
        ".native-edit-viewport .native-edit-page canvas",
      );
      if (canvas && canvas.width > 0 && canvas.height > 0) stableFrames++;
      else stableFrames = 0;

      // Wait for the new canvas to settle for two paints before uncovering it.
      if (stableFrames >= 3 || performance.now() - started > 20000) {
        cover.style.display = "none";
        cover.replaceChildren();
        oldDocumentRef.current = null;
        return;
      }
      frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [activeDocumentId, revisionKey]);

  return <div ref={ref} className="native-edit-paint-shield" aria-hidden="true" />;
}
