export type AnnotationKind =
  | "highlight"
  | "underline"
  | "strike"
  | "note"
  | "draw"
  | "shape"
  | "signature"
  | "redact"
  | "image";

export interface Annotation {
  id: string;
  page: number;
  kind: AnnotationKind;
  createdAt: number;
  updatedAt: number;
  payload: Record<string, unknown>;
}

export interface AnnotationCreateInput {
  page: number;
  kind: AnnotationKind;
  payload: Record<string, unknown>;
}

export interface OcrJob {
  id: string;
  filePath: string;
  language: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  progress: number;
  outputPath?: string;
  outputBytes?: Uint8Array;
  error?: string;
}

export interface OpenDocumentResult {
  filePath: string;
  bytes: Uint8Array;
  openedAt: number;
}

export interface RecentDocument {
  filePath: string;
  openedAt: number;
}

export interface SessionSnapshot {
  activeFilePath: string | null;
  openTabs: string[];
  activeTabIndex: number;
  updatedAt: number;
}

/* ---- NEW TYPES ---- */

export interface PasswordOptions {
  userPassword?: string;
  ownerPassword?: string;
  /** bitwise: 4=print, 8=modify, 16=copy, 32=annotate */
  permissions?: number;
}

export interface PageRange {
  start: number; // 1-indexed
  end: number;   // inclusive, 1-indexed
}

export interface PageNumbers {
  startNumber?: number;  // default: 1
  position: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
  fontSize?: number;     // default: 12
  fontColor?: string;    // hex: "#000000"
  prefix?: string;       // e.g. "Page "
  suffix?: string;
  pages?: PageRange;     // default: all pages
}

export interface HeaderFooterLine {
  align: "left" | "center" | "right";
  text: string;
  fontName?: string;
  fontSize?: number;
  fontColor?: string;
}

export interface CropOptions {
  page: number; // 1-indexed
  x: number;    // percentage 0-1
  y: number;
  width: number;
  height: number;
}

export interface InsertOptions {
  position: "before" | "after";
  targetPage: number; // 1-indexed
  bytes: Uint8Array;
}

export interface Bookmark {
  title: string;
  page: number;   // 1-indexed
  parent?: number; // index in bookmarks array (0-indexed)
}

export interface SignOptions {
  /** path to .p12 or .pfx certificate file */
  certificatePath: string;
  /** password for the PFX certificate */
  certificatePassword: string;
  /** reason for signing */
  reason?: string;
  /** location (e.g. "Hanoi, Vietnam") */
  location?: string;
  /** contact info */
  contactInfo?: string;
  /** page number to place signature (1-indexed) */
  page?: number;
  /** signature rectangle coordinates (percentage 0-1) */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}
