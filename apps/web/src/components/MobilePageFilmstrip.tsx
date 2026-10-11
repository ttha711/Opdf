import { useEffect, useRef, useState } from "react";
import { renderViewerPageImage } from "../lib/viewer-runtime";

function PageThumbnail({
  page,
  active,
  onSelect,
}: {
  page: number;
  active: boolean;
  onSelect: (page: number) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const element = buttonRef.current;
    if (!element) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    const load = async () => {
      const blob = await renderViewerPageImage(page).catch(() => null);
      if (!blob || cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setImageUrl(objectUrl);
    };

    if (typeof IntersectionObserver === "undefined") {
      void load();
    } else {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void load();
      }, { rootMargin: "220px" });
      observer.observe(element);
      return () => {
        cancelled = true;
        observer.disconnect();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [page]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={"opdf-mobile-filmstrip__thumb" + (active ? " active" : "")}
      onClick={() => onSelect(page)}
      data-opdf-page-thumb={page}
      aria-label={`Go to page ${page}`}
      aria-current={active ? "page" : undefined}
    >
      <span className="opdf-mobile-filmstrip__preview">
        {imageUrl ? <img src={imageUrl} alt="" /> : <span>Page {page}</span>}
      </span>
      <span className="opdf-mobile-filmstrip__number">{page}</span>
    </button>
  );
}

export function MobilePageFilmstrip({
  isOpen,
  page,
  totalPages,
  onSelectPage,
  onClose,
}: {
  isOpen: boolean;
  page: number;
  totalPages: number;
  onSelectPage: (page: number) => void;
  onClose: () => void;
}) {
  const [jumpPage, setJumpPage] = useState("");
  // Do not create one observer/image/button per page for multi-thousand-page CAD files.
  const radius = 10;
  const start = Math.max(1, Math.min(page - radius, Math.max(1, totalPages - radius * 2)));
  const end = Math.min(totalPages, start + radius * 2);
  const visiblePages = Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);

  useEffect(() => {
    if (isOpen) setJumpPage(String(page));
  }, [isOpen, page]);

  useEffect(() => {
    if (!isOpen) return;
    const current = document.querySelector<HTMLElement>(`[data-opdf-page-thumb="${page}"]`);
    requestAnimationFrame(() => current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, page]);

  if (!isOpen || totalPages < 1) return null;

  return (
    <div className="opdf-mobile-filmstrip" data-opdf-mobile-filmstrip="true" role="dialog" aria-label="Page previews">
      <div className="opdf-mobile-filmstrip__header">
        <strong>Pages</strong>
        <span>{page} / {totalPages}</span>
        <form className="opdf-mobile-page-jump" onSubmit={(event) => {
          event.preventDefault();
          const target = Number(jumpPage);
          if (!Number.isInteger(target) || target < 1 || target > totalPages) return;
          onSelectPage(target);
          onClose();
        }}>
          <input type="number" min={1} max={totalPages} value={jumpPage}
            onChange={(event) => setJumpPage(event.target.value)}
            aria-label="Jump to page" inputMode="numeric" />
          <button type="submit" aria-label="Go to page">Go</button>
        </form>
        <button type="button" onClick={onClose} aria-label="Close page previews">×</button>
      </div>
      <div className="opdf-mobile-filmstrip__track">
        {visiblePages.map((pageNumber) => (
          <PageThumbnail
            key={pageNumber}
            page={pageNumber}
            active={pageNumber === page}
            onSelect={(nextPage) => {
              onSelectPage(nextPage);
              onClose();
            }}
          />
        ))}
      </div>
    </div>
  );
}
