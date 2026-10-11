import { useEffect, useRef, useState } from "react";
import { renderViewerPageImage } from "../../lib/viewer-runtime";

export function PageOrganizerThumbnail({ page, deleted, rotation }: {
  page: number;
  deleted: boolean;
  rotation: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const target = ref.current;
    if (!target || deleted) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    const load = async () => {
      const blob = await renderViewerPageImage(page).catch(() => null);
      if (!blob || cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    };
    const observer = typeof IntersectionObserver !== "undefined" ?
      new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer?.disconnect();
        void load();
      }, { rootMargin: "250px" }) : null;
    if (observer) observer.observe(target);
    else void load();
    return () => {
      cancelled = true;
      observer?.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [page, deleted]);

  return (
    <div ref={ref} className="flex h-36 items-center justify-center overflow-hidden rounded bg-[var(--ui-muted-bg)]">
      {src ? <img src={src} alt="" loading="lazy"
        className="max-h-full max-w-full object-contain"
        style={{ transform: `rotate(${rotation}deg)` }} /> :
        <span className="text-xs text-[var(--text-secondary)]">Page {page}</span>}
    </div>
  );
}
