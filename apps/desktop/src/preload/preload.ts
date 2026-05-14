import { contextBridge, ipcRenderer } from "electron";
import type {
  Annotation,
  AnnotationCreateInput,
  OcrJob,
  OpenDocumentResult,
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
  saveDocumentAs: (bytes: Uint8Array) => ipcRenderer.invoke("opdf:save-as", bytes) as Promise<string | null>,

  getRecent: () => ipcRenderer.invoke("opdf:storage:get-recent") as Promise<RecentDocument[]>,
  pushRecent: (filePath: string) => ipcRenderer.invoke("opdf:storage:push-recent", filePath) as Promise<void>,
  restoreSession: () => ipcRenderer.invoke("opdf:storage:restore-session") as Promise<SessionSnapshot>,
  writeSession: (session: SessionSnapshot) => ipcRenderer.invoke("opdf:storage:write-session", session) as Promise<void>,

  listAnnotations: (documentId: string) => ipcRenderer.invoke("opdf:annotation:list", documentId) as Promise<Annotation[]>,
  createAnnotation: (documentId: string, input: AnnotationCreateInput) => ipcRenderer.invoke("opdf:annotation:create", documentId, input) as Promise<Annotation>,
  deleteAnnotation: (documentId: string, id: string) => ipcRenderer.invoke("opdf:annotation:delete", documentId, id) as Promise<boolean>,
  undoAnnotation: (documentId: string) => ipcRenderer.invoke("opdf:annotation:undo", documentId) as Promise<Annotation[]>,
  redoAnnotation: (documentId: string) => ipcRenderer.invoke("opdf:annotation:redo", documentId) as Promise<Annotation[]>,

  enqueueOcr: (filePath: string, language?: string) => ipcRenderer.invoke("opdf:ocr:enqueue", filePath, language) as Promise<OcrJob>,
  runOcr: (jobId: string) => ipcRenderer.invoke("opdf:ocr:run", jobId) as Promise<OcrJob | null>,
  listOcrJobs: () => ipcRenderer.invoke("opdf:ocr:list") as Promise<OcrJob[]>,
};

contextBridge.exposeInMainWorld("opdf", api);
