import { contextBridge, ipcRenderer } from "electron";
import type {
  Annotation,
  AnnotationCreateInput,
  OcrJob,
  OpenDocumentResult,
  PasswordOptions,
  PageNumbers,
  HeaderFooterLine,
  CropOptions,
  InsertOptions,
  RecentDocument,
  SessionSnapshot,
} from "@opdf/core";

const api = {
  openProjectFolder: () => ipcRenderer.invoke("opdf:open-project-folder") as Promise<boolean>,
  pickAndOpenDocument: () => ipcRenderer.invoke("opdf:pick-and-open") as Promise<OpenDocumentResult | null>,
  openDocument: (filePath: string) => ipcRenderer.invoke("opdf:open", filePath) as Promise<OpenDocumentResult>,
  saveDocument: (filePath: string, bytes: Uint8Array) => ipcRenderer.invoke("opdf:save", filePath, bytes) as Promise<void>,
  exportFlattened: (bytes: Uint8Array, annotations: any[]) => ipcRenderer.invoke("opdf:export-flattened", bytes, annotations) as Promise<Uint8Array>,
  compressPdf: (bytes: Uint8Array) => ipcRenderer.invoke("opdf:compress", bytes) as Promise<Uint8Array>,
  watermarkPdf: (bytes: Uint8Array, text: string) => ipcRenderer.invoke("opdf:watermark", bytes, text) as Promise<Uint8Array>,
  mergePdfs: (bytesList: Uint8Array[]) => ipcRenderer.invoke("opdf:merge", bytesList) as Promise<Uint8Array>,
  splitPdf: (bytes: Uint8Array, pages: number[]) => ipcRenderer.invoke("opdf:split", bytes, pages) as Promise<Uint8Array[]>,
  encryptPdf: (bytes: Uint8Array, opts: PasswordOptions) => ipcRenderer.invoke("opdf:encrypt", bytes, opts) as Promise<Uint8Array>,
  decryptPdf: (bytes: Uint8Array, password: string) => ipcRenderer.invoke("opdf:decrypt", bytes, password) as Promise<Uint8Array>,
  insertPages: (bytes: Uint8Array, opts: InsertOptions) => ipcRenderer.invoke("opdf:insert-pages", bytes, opts) as Promise<Uint8Array>,
  deletePages: (bytes: Uint8Array, pageNumbers: number[]) => ipcRenderer.invoke("opdf:delete-pages", bytes, pageNumbers) as Promise<Uint8Array>,
  cropPage: (bytes: Uint8Array, opts: CropOptions) => ipcRenderer.invoke("opdf:crop-page", bytes, opts) as Promise<Uint8Array>,
  addPageNumbers: (bytes: Uint8Array, opts: PageNumbers) => ipcRenderer.invoke("opdf:add-page-numbers", bytes, opts) as Promise<Uint8Array>,
  addHeaderFooter: (bytes: Uint8Array, lines: HeaderFooterLine[], isHeader: boolean) => ipcRenderer.invoke("opdf:add-header-footer", bytes, lines, isHeader) as Promise<Uint8Array>,
  addBookmarks: (bytes: Uint8Array, bookmarks: Array<{ title: string; page: number; parent?: number }>) => ipcRenderer.invoke("opdf:add-bookmarks", bytes, bookmarks) as Promise<Uint8Array>,
  addBatesNumbering: (bytes: Uint8Array, prefix: string, startNumber: number, suffix?: string) => ipcRenderer.invoke("opdf:add-bates-numbering", bytes, prefix, startNumber, suffix) as Promise<Uint8Array>,
  convertToPdfA: (bytes: Uint8Array) => ipcRenderer.invoke("opdf:convert-to-pdfa", bytes) as Promise<Uint8Array>,
  rotatePages: (bytes: Uint8Array, pageNumbers: number[], degrees: number) => ipcRenderer.invoke("opdf:rotate-pages", bytes, pageNumbers, degrees) as Promise<Uint8Array>,
  convertPdfOffice: (bytes: Uint8Array, format: "docx" | "pptx" | "xlsx") => ipcRenderer.invoke("opdf:convert-pdf-office", bytes, format) as Promise<Uint8Array>,
  applyAiPatch: (payload: { prompt: string; selectedBlocks: unknown[]; allBlocks: unknown[]; referenceImage: string | null }) =>
    ipcRenderer.invoke("opdf:ai-patch", payload) as Promise<{ updates: Array<Record<string, unknown> & { id: string }> }>,
  saveDocumentAs: (bytes: Uint8Array) => ipcRenderer.invoke("opdf:save-as", bytes) as Promise<string | null>,
  saveFile: (bytes: Uint8Array, defaultName: string, extensions: string[]) => ipcRenderer.invoke("opdf:save-file", bytes, defaultName, extensions) as Promise<string | null>,
  setAiConfig: (config: { mode: "dify" | "local" | "iframe"; difyUrl?: string; difyKey?: string }) => ipcRenderer.invoke("opdf:ai-config:set", config) as Promise<boolean>,
  getAiConfig: () => ipcRenderer.invoke("opdf:ai-config:get") as Promise<{ mode: "dify" | "local" | "iframe"; difyUrl?: string; difyKey?: string }>,
  getRecent: () => ipcRenderer.invoke("opdf:storage:get-recent") as Promise<RecentDocument[]>,
  pushRecent: (filePath: string) => ipcRenderer.invoke("opdf:storage:push-recent", filePath) as Promise<void>,
  restoreSession: () => ipcRenderer.invoke("opdf:storage:restore-session") as Promise<SessionSnapshot>,
  writeSession: (session: SessionSnapshot) => ipcRenderer.invoke("opdf:storage:write-session", session) as Promise<void>,

  listAnnotations: (documentId: string) => ipcRenderer.invoke("opdf:annotation:list", documentId) as Promise<Annotation[]>,
  createAnnotation: (documentId: string, input: AnnotationCreateInput) => ipcRenderer.invoke("opdf:annotation:create", documentId, input) as Promise<Annotation>,
  deleteAnnotation: (documentId: string, id: string) => ipcRenderer.invoke("opdf:annotation:delete", documentId, id) as Promise<boolean>,
  updateAnnotation: (documentId: string, id: string, payload: Record<string, unknown>) => ipcRenderer.invoke("opdf:annotation:update", documentId, id, payload) as Promise<Annotation | null>,
  undoAnnotation: (documentId: string) => ipcRenderer.invoke("opdf:annotation:undo", documentId) as Promise<Annotation[]>,
  redoAnnotation: (documentId: string) => ipcRenderer.invoke("opdf:annotation:redo", documentId) as Promise<Annotation[]>,

  enqueueOcr: (filePath: string, language?: string) => ipcRenderer.invoke("opdf:ocr:enqueue", filePath, language) as Promise<OcrJob>,
  runOcr: (jobId: string, inputBytes?: Uint8Array) => ipcRenderer.invoke("opdf:ocr:run", jobId, inputBytes) as Promise<OcrJob | null>,
  listOcrJobs: () => ipcRenderer.invoke("opdf:ocr:list") as Promise<OcrJob[]>,
};

contextBridge.exposeInMainWorld("opdf", api);

