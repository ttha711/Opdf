export type AnnotationKind =
  | "highlight"
  | "underline"
  | "strike"
  | "note"
  | "draw"
  | "shape"
  | "signature"
  | "redact";

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