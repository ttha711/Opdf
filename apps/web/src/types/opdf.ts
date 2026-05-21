import type {
  Annotation,
  AnnotationCreateInput,
  OcrJob,
  OpenDocumentResult,
  RecentDocument,
  SessionSnapshot,
  PasswordOptions,
  PageNumbers,
  HeaderFooterLine,
  CropOptions,
  InsertOptions,
} from "@opdf/core";
import type { EditorBlock, LivePatch } from "../components/live-editor/types";

export type AiPatchRequest = {
  prompt: string;
  selectedBlocks: EditorBlock[];
  allBlocks: EditorBlock[];
  referenceImage: string | null;
};

export interface OpdfBridge {
  openProjectFolder: () => Promise<boolean>;
  pickAndOpenDocument: () => Promise<OpenDocumentResult | null>;
  openDocument: (filePath: string) => Promise<OpenDocumentResult>;
  saveDocument: (filePath: string, bytes: Uint8Array) => Promise<void>;
  exportFlattened: (bytes: Uint8Array, annotations: Annotation[]) => Promise<Uint8Array>;
  compressPdf: (bytes: Uint8Array) => Promise<Uint8Array>;
  watermarkPdf: (bytes: Uint8Array, text: string) => Promise<Uint8Array>;
  mergePdfs: (bytesList: Uint8Array[]) => Promise<Uint8Array>;
  splitPdf: (bytes: Uint8Array, pages: number[]) => Promise<Uint8Array[]>;
  saveDocumentAs: (bytes: Uint8Array) => Promise<string | null>;
  saveFile: (bytes: Uint8Array, defaultName: string, extensions: string[]) => Promise<string | null>;
  getRecent: () => Promise<RecentDocument[]>;
  pushRecent: (filePath: string) => Promise<void>;
  restoreSession: () => Promise<SessionSnapshot>;
  writeSession: (session: SessionSnapshot) => Promise<void>;
  listAnnotations: (documentId: string) => Promise<Annotation[]>;
  replaceAnnotations: (documentId: string, annotations: Annotation[]) => Promise<Annotation[]>;
  createAnnotation: (documentId: string, input: AnnotationCreateInput) => Promise<Annotation>;
  deleteAnnotation: (documentId: string, id: string) => Promise<boolean>;
  updateAnnotation: (documentId: string, id: string, payload: Record<string, unknown>) => Promise<Annotation | null>;
  undoAnnotation: (documentId: string) => Promise<Annotation[]>;
  redoAnnotation: (documentId: string) => Promise<Annotation[]>;
  enqueueOcr: (filePath: string, language?: string) => Promise<OcrJob>;
  runOcr: (jobId: string, inputBytes?: Uint8Array) => Promise<OcrJob | null>;
  listOcrJobs: () => Promise<OcrJob[]>;

  /* ----- NEW FEATURES ----- */
  encryptPdf: (bytes: Uint8Array, opts: PasswordOptions) => Promise<Uint8Array>;
  decryptPdf: (bytes: Uint8Array, password: string) => Promise<Uint8Array>;
  insertPages: (bytes: Uint8Array, opts: InsertOptions) => Promise<Uint8Array>;
  deletePages: (bytes: Uint8Array, pageNumbers: number[]) => Promise<Uint8Array>;
  cropPage: (bytes: Uint8Array, opts: CropOptions) => Promise<Uint8Array>;
  addPageNumbers: (bytes: Uint8Array, opts: PageNumbers) => Promise<Uint8Array>;
  addHeaderFooter: (bytes: Uint8Array, lines: HeaderFooterLine[], isHeader: boolean) => Promise<Uint8Array>;
  addBookmarks: (bytes: Uint8Array, bookmarks: Array<{ title: string; page: number; parent?: number }>) => Promise<Uint8Array>;
  addBatesNumbering: (bytes: Uint8Array, prefix: string, startNumber: number, suffix?: string) => Promise<Uint8Array>;
  convertToPdfA: (bytes: Uint8Array) => Promise<Uint8Array>;
  rotatePages: (bytes: Uint8Array, pageNumbers: number[], degrees: number) => Promise<Uint8Array>;
  convertPdfOffice?: (bytes: Uint8Array, format: "docx" | "pptx" | "xlsx") => Promise<Uint8Array>;
  setAiConfig?: (config: { mode: "dify" | "local" | "iframe"; difyUrl?: string; difyKey?: string }) => Promise<boolean>;
  getAiConfig?: () => Promise<{ mode: "dify" | "local" | "iframe"; difyUrl?: string; difyKey?: string }>;
  getAiAccessToken?: () => Promise<string | null>;
  getAiDeviceStatus?: () => Promise<{
    deviceId: string;
    hasToken: boolean;
    expiresAt: string | null;
    lastError: string | null;
    gatewayBaseUrl: string | null;
  }>;
  applyAiPatch?: (payload: AiPatchRequest) => Promise<LivePatch>;
}

declare global {
  interface Window {
    opdf?: OpdfBridge;
    __opdfAiEditorBootstrap?: {
      fileName?: string;
      docBytes?: number[];
    };
    __opdfAiEditorGetBootstrap?: () => {
      fileName?: string;
      docBytes?: number[];
    };
  }
}


