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
        <button type="button" onClick={onClose} aria-label="Close page previews">×</button>
      </div>
      <div className="opdf-mobile-filmstrip__track">
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
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
