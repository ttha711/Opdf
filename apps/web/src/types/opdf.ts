import type {
  Annotation,
  AnnotationCreateInput,
  OcrJob,
  OpenDocumentResult,
  RecentDocument,
  SessionSnapshot,
} from "@opdf/core";

export interface OpdfBridge {
  openProjectFolder: () => Promise<boolean>;
  pickAndOpenDocument: () => Promise<OpenDocumentResult | null>;
  openDocument: (filePath: string) => Promise<OpenDocumentResult>;
  saveDocument: (filePath: string, bytes: Uint8Array) => Promise<void>;
  saveDocumentAs: (bytes: Uint8Array) => Promise<string | null>;
  getRecent: () => Promise<RecentDocument[]>;
  pushRecent: (filePath: string) => Promise<void>;
  restoreSession: () => Promise<SessionSnapshot>;
  writeSession: (session: SessionSnapshot) => Promise<void>;
  listAnnotations: (documentId: string) => Promise<Annotation[]>;
  createAnnotation: (documentId: string, input: AnnotationCreateInput) => Promise<Annotation>;
  deleteAnnotation: (documentId: string, id: string) => Promise<boolean>;
  undoAnnotation: (documentId: string) => Promise<Annotation[]>;
  redoAnnotation: (documentId: string) => Promise<Annotation[]>;
  enqueueOcr: (filePath: string, language?: string) => Promise<OcrJob>;
  runOcr: (jobId: string) => Promise<OcrJob | null>;
  listOcrJobs: () => Promise<OcrJob[]>;
}

declare global {
  interface Window {
    opdf?: OpdfBridge;
  }
}
