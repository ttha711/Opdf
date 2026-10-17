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
  const isShieldActiveRef = useRef(false);

  useLayoutEffect(() => {
    if (revisionKey === lastRevisionRef.current) return;
    lastRevisionRef.current = revisionKey;
    const cover = ref.current;
    const surface = cover?.parentElement;
    const viewport = surface?.querySelector(".native-edit-viewport");
    if (!cover || !surface || !viewport) return;

    // RenderLayer can produce a raster <img> instead of a <canvas>.
    const rasters = viewport.querySelectorAll<HTMLImageElement | HTMLCanvasElement>(
      ".native-edit-page img, .native-edit-page canvas",
    );
    if (!rasters.length) return;

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
    for (const raster of rasters) {
      const ready = raster instanceof HTMLCanvasElement
        ? raster.width > 0 && raster.height > 0
        : raster.complete && raster.naturalWidth > 0;
      if (!ready) continue;
      const bounds = raster.getBoundingClientRect();
      try {
        context.drawImage(raster, bounds.left - rect.left, bounds.top - rect.top, bounds.width, bounds.height);
        painted = true;
      } catch {
        // A stale raster may have been disposed. Never block PDF editing.
      }
    }
    if (!painted) return;
    snapshot.style.width = "100%";
    snapshot.style.height = "100%";
    cover.replaceChildren(snapshot);
    cover.style.display = "block";
    isShieldActiveRef.current = true;
  }, [revisionKey]);

  useEffect(() => {
    const cover = ref.current;
    if (!cover || !isShieldActiveRef.current) return;

    let frame = 0;
    let stableFrames = 0;
    const started = performance.now();
    let cancelled = false;

    const hide = () => {
      cover.style.display = "none";
      cover.replaceChildren();
      isShieldActiveRef.current = false;
    };

    const check = () => {
      if (cancelled) return;
      const raster = cover.parentElement?.querySelector<HTMLImageElement | HTMLCanvasElement>(
        ".native-edit-viewport .native-edit-page img, .native-edit-viewport .native-edit-page canvas",
      );
      const ready = raster instanceof HTMLCanvasElement
        ? raster.width > 0 && raster.height > 0
        : raster instanceof HTMLImageElement && raster.complete && raster.naturalWidth > 0;
      if (ready) stableFrames++;
      else stableFrames = 0;

      // Wait for the new canvas to settle for two paints before uncovering it,
      // or uncover after safety timeout (2500ms max) so editing is never blocked.
      if (stableFrames >= 3 || performance.now() - started > 2500) {
        hide();
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
