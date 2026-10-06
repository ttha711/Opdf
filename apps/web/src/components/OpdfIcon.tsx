import type { ReactNode, SVGProps } from "react";

export type OpdfIconName =
  | "advanced"
  | "bates"
  | "chevron-down"
  | "chevron-right"
  | "close"
  | "compare"
  | "compress"
  | "copy"
  | "crop"
  | "draw"
  | "edit"
  | "export"
  | "external"
  | "file"
  | "file-pdf"
  | "file-text"
  | "fit-page"
  | "fit-width"
  | "folder-open"
  | "form"
  | "hash"
  | "header"
  | "highlight"
  | "image"
  | "insert"
  | "lock"
  | "measure"
  | "merge"
  | "moon"
  | "more-horizontal"
  | "note"
  | "ocr"
  | "page"
  | "palette"
  | "plus"
  | "redo"
  | "redact"
  | "rectangle"
  | "rotate-left"
  | "rotate-right"
  | "save"
  | "search"
  | "signature"
  | "sparkles"
  | "split"
  | "sun"
  | "text"
  | "tools"
  | "trash"
  | "undo"
  | "unlock"
  | "view"
  | "watermark"
  | "zoom-in"
  | "zoom-out";

const glyphs: Record<OpdfIconName, ReactNode> = {
  advanced: <><path d="M4 12h16M12 4v16" /><circle cx="12" cy="12" r="8" /></>,
  bates: <><path d="M5 7h14M5 12h14M5 17h9" /><path d="M17 15v5m-2.5-2.5h5" /></>,
  "chevron-down": <path d="m7 9 5 5 5-5" />,
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  close: <><path d="M18 6 6 18M6 6l12 12" /></>,
  compare: <><path d="M7 7h11m0 0-3-3m3 3-3 3M17 17H6m0 0 3 3m-3-3 3-3" /></>,
  compress: <><path d="M8 3v5H3M16 21v-5h5M3 8l5-5M21 16l-5 5" /><rect x="8" y="8" width="8" height="8" rx="1.5" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" /></>,
  crop: <><path d="M7 3v14a2 2 0 0 0 2 2h12M3 7h14a2 2 0 0 1 2 2v12" /></>,
  draw: <path d="M4 18c3-7 5-9 7-9 2.5 0 1 6 3.5 6 1.4 0 2.2-1.3 5.5-5" />,
  edit: <><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m13.5 7.5 3 3" /></>,
  export: <><path d="M12 3v12m0-12 4 4m-4-4-4 4" /><path d="M5 13v7h14v-7" /></>,
  external: <><path d="M14 4h6v6M20 4 11 13" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
  file: <><path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5" /></>,
  "file-pdf": <><path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5M8 13h8M8 17h5" /></>,
  "file-text": <><path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5M8 12h8M8 16h8" /></>,
  "fit-page": <><rect x="6" y="3" width="12" height="18" rx="1.5" /><path d="M9 7h6M9 17h6" /></>,
  "fit-width": <><path d="M3 12h18M3 12l3-3m-3 3 3 3m15-3-3-3m3 3-3 3" /><rect x="7" y="5" width="10" height="14" rx="1.5" /></>,
  "folder-open": <path d="M3 18 5.5 9h15L18 20H5a2 2 0 0 1-2-2Zm1-9V6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v1" />,
  form: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h3M8 16h8" /><rect x="13" y="10.5" width="3" height="3" rx=".5" /></>,
  hash: <><path d="M9 3 7 21M17 3l-2 18M4 9h16M3 15h16" /></>,
  header: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 8h16M8 6h8" /></>,
  highlight: <><path d="m6 15 7.8-7.8 3 3L9 18H6v-3Z" /><path d="M4 20h8" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m5 18 5-5 3 3 2-2 4 4" /></>,
  insert: <><path d="M12 5v14M5 12h14" /><rect x="3" y="3" width="18" height="18" rx="2" /></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  measure: <><path d="M5 18 18 5" /><path d="m8 17-1.5-1.5M11 14l-1.5-1.5M14 11l-1.5-1.5M17 8l-1.5-1.5" /></>,
  merge: <><path d="M7 4v5a3 3 0 0 0 3 3h7M7 20v-5a3 3 0 0 1 3-3h7" /><path d="m14 9 3 3-3 3" /></>,
  moon: <path d="M20 15.2A8.5 8.5 0 1 1 8.8 4 7 7 0 0 0 20 15.2Z" />,
  "more-horizontal": <><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" /></>,
  note: <><path d="M5 4h14v12H9l-4 4V4Z" /><path d="M8 8h8M8 12h5" /></>,
  ocr: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 9h8M8 12h8M8 15h5" /></>,
  page: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a2 2 0 0 1 0-4h2.5A6.5 6.5 0 0 0 12 3Z" /><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="9" r="1" fill="currentColor" stroke="none" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  redo: <><path d="M15 7h4V3M19 7l-4-4M18.5 7.5A8 8 0 1 0 16 18.7" /></>,
  redact: <><rect x="4" y="7" width="16" height="10" rx="1" /><path d="M7 10h10M7 14h7" /></>,
  rectangle: <rect x="5" y="6" width="14" height="12" rx="1" />,
  "rotate-left": <><path d="M9 7H5V3M5 7l4-4" /><path d="M5.5 8A8 8 0 1 0 8 18.7" /></>,
  "rotate-right": <><path d="M15 7h4V3M19 7l-4-4" /><path d="M18.5 8A8 8 0 1 1 16 18.7" /></>,
  save: <><path d="M5 4h12l2 2v14H5Z" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
  signature: <><path d="M4 17c2-5 3.5-8 5-8 1.2 0 .2 5 1.5 5 1 0 2-3 3-3 1.2 0 .4 3 1.8 3 1.1 0 1.7-1 4.7-4" /><path d="M4 20h16" /></>,
  sparkles: <><path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4L12 3Z" /><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14ZM5.5 13l.6 1.4 1.4.6-1.4.6L5.5 17l-.6-1.4-1.4-.6 1.4-.6.6-1.4Z" /></>,
  split: <><path d="M7 4v16M17 4v16" /><path d="M10 12h4M12 10v4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
  text: <><path d="M5 5h14M12 5v14M8 19h8" /></>,
  tools: <><path d="m14 6 4-4 2 2-4 4" /><path d="m13 7 4 4-9 9H4v-4l9-9Z" /><path d="m12 8 4 4" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>,
  undo: <><path d="M9 7H5V3M5 7l4-4M5.5 7.5A8 8 0 1 1 8 18.7" /></>,
  unlock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.5-2" /></>,
  view: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  watermark: <><path d="M12 3c3 4 5 6.5 5 10a5 5 0 0 1-10 0c0-3.5 2-6 5-10Z" /><path d="M9 15c.8 1 1.8 1.5 3 1.5" /></>,
  "zoom-in": <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4 4M10.5 7.5v6M7.5 10.5h6" /></>,
  "zoom-out": <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4 4M7.5 10.5h6" /></>,
};

export function OpdfIcon({
  name,
  size = 18,
  strokeWidth = 1.8,
  className,
  ...props
}: {
  name: OpdfIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["opdf-icon", className].filter(Boolean).join(" ")}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {glyphs[name]}
    </svg>
  );
}
