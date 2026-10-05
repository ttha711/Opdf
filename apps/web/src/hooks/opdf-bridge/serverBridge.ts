// opdf-file-size-allow: legacy server bridge coordinator; OCR transport stays isolated in serverOcr.ts.
import type {
  Annotation, AnnotationCreateInput, OcrJob, OpenDocumentResult,
  RecentDocument, SessionSnapshot, PasswordOptions, PageNumbers,
  HeaderFooterLine, CropOptions, InsertOptions,
} from "@opdf/core";
import type { OpdfBridge } from "../../types/opdf";
import { createMockBridge } from "./mockBridge";
import { createServerOcrClient } from "./serverOcr";
import { createServerSigningClient } from "./serverSigning";

type ServerUploadResult = {
  id: string;
  fileName: string;
  filePath: string;
  size: number;
  openedAt: number;
};

function parseServerId(filePath: string): string | null {
  const match = /^server:\/\/([0-9a-f-]{36})\//i.exec(filePath);
  return match?.[1] ?? null;
}

async function expectJson<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;
  let message = `HTTP ${response.status}`;
  try {
    const body = await response.json() as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // Keep status-only error.
  }
  throw new Error(message);
}

function encodeOperationOptions(value: Record<string, unknown>) {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function runPdfOperation(
  baseUrl: string,
  operation: "compress" | "encrypt" | "decrypt",
  bytes: Uint8Array,
  options?: Record<string, unknown>,
) {
  const response = await fetch(`${baseUrl}/operations/${operation}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      ...(options ? { "X-OPDF-Options": encodeOperationOptions(options) } : {}),
    },
    body: bytes as unknown as BodyInit,
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json() as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Keep the HTTP status as the fallback message.
    }
    throw new Error(message);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function downloadBytes(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function createServerBridge(baseUrl = "/api/opdf"): OpdfBridge {
  const browser = createMockBridge();
  const serverOcr = createServerOcrClient(baseUrl);
  const serverSigning = createServerSigningClient(baseUrl);
  const annotationUndo = new Map<string, Annotation[][]>();
  const annotationRedo = new Map<string, Annotation[][]>();

  async function replaceAnnotations(documentId: string, annotations: Annotation[]) {
    const id = parseServerId(documentId);
    if (!id) return browser.replaceAnnotations(documentId, annotations);
    return expectJson<Annotation[]>(await fetch(`${baseUrl}/documents/${id}/annotations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotations }),
    }));
  }

  async function listAnnotations(documentId: string) {
    const id = parseServerId(documentId);
    if (!id) return browser.listAnnotations(documentId);
    return expectJson<Annotation[]>(await fetch(`${baseUrl}/documents/${id}/annotations`));
  }

  async function mutateAnnotations(
    documentId: string,
    updater: (rows: Annotation[]) => Annotation[],
  ) {
    const previous = await listAnnotations(documentId);
    const next = updater(previous);
    const undo = annotationUndo.get(documentId) ?? [];
    undo.push(previous);
    if (undo.length > 50) undo.shift();
    annotationUndo.set(documentId, undo);
    annotationRedo.set(documentId, []);
    return replaceAnnotations(documentId, next);
  }

  return {
    ...browser,
    capabilities: {
      compress: true,
      encrypt: true,
      bookmarksPersist: true,
      pdfA: browser.capabilities?.pdfA ?? false,
      digitalSignature: true,
      certificateStorage: true,
      signatureInspection: true,
      storedMutations: true,
      rangePreview: true,
      ocrQueue: true,
      searchablePdfOcr: true,
    },

    async compressPdf(bytes: Uint8Array) {
      return runPdfOperation(baseUrl, "compress", bytes);
    },

    async encryptPdf(bytes: Uint8Array, opts: PasswordOptions) {
      return runPdfOperation(baseUrl, "encrypt", bytes, {
        userPassword: opts.userPassword,
        ownerPassword: opts.ownerPassword,
        permissions: opts.permissions,
      });
    },

    async decryptPdf(bytes: Uint8Array, password: string) {
      return runPdfOperation(baseUrl, "decrypt", bytes, { password });
    },

    async pickAndOpenDocument() {
      throw new Error("Server runtime uses the browser file picker. Select a PDF to upload.");
    },

    async openDocument(filePath: string): Promise<OpenDocumentResult> {
      const id = parseServerId(filePath);
      if (!id) throw new Error("Invalid server document reference.");
      const response = await fetch(`${baseUrl}/documents/${id}`);
      if (!response.ok) throw new Error(`Unable to open server document: HTTP ${response.status}`);
      return {
        filePath,
        bytes: new Uint8Array(await response.arrayBuffer()),
        openedAt: Date.now(),
      };
    },

    async saveDocument(filePath: string, bytes: Uint8Array) {
      const id = parseServerId(filePath);
      if (!id) throw new Error("Document is not stored on the OPDF server yet.");
      const response = await fetch(`${baseUrl}/documents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: bytes as unknown as BodyInit,
      });
      await expectJson(response);
    },

    async mutateStoredDocument(filePath, mutation) {
      const id = parseServerId(filePath);
      if (!id) throw new Error("Document is not stored on the OPDF server yet.");
      const response = await fetch(`${baseUrl}/documents/${id}/mutations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mutation),
      });
      return expectJson(response);
    },

    async saveDocumentAs(bytes: Uint8Array) {
      const name = "document.pdf";
      const response = await fetch(`${baseUrl}/documents?name=${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: bytes as unknown as BodyInit,
      });
      return (await expectJson<ServerUploadResult>(response)).filePath;
    },

    async convertPdfOffice(bytes: Uint8Array, format: "docx" | "pptx" | "xlsx") {
      const response = await fetch(
        `${baseUrl}/operations/convert-office?format=${encodeURIComponent(format)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/pdf" },
          body: bytes as unknown as BodyInit,
        },
      );
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = await response.json() as { error?: string };
          if (payload.error) message = payload.error;
        } catch {
          // Keep status fallback.
        }
        throw new Error(message);
      }
      return new Uint8Array(await response.arrayBuffer());
    },

    async convertOfficeToPdf(bytes: Uint8Array, fileName: string) {
      const response = await fetch(
        `${baseUrl}/operations/office-to-pdf?name=${encodeURIComponent(fileName)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: bytes as unknown as BodyInit,
        },
      );
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = await response.json() as { error?: string };
          if (payload.error) message = payload.error;
        } catch {
          // Keep status fallback.
        }
        throw new Error(message);
      }
      return new Uint8Array(await response.arrayBuffer());
    },

    async saveFile(bytes: Uint8Array, defaultName: string, extensions: string[]) {
      const ext = extensions[0] || "pdf";
      const name = defaultName.includes(".") ? defaultName : `${defaultName}.${ext}`;
      downloadBytes(bytes, name);
      return name;
    },

    async getRecent(): Promise<RecentDocument[]> {
      return expectJson(await fetch(`${baseUrl}/recent`));
    },

    async pushRecent(filePath: string) {
      await expectJson(await fetch(`${baseUrl}/recent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath }),
      }));
    },

    async restoreSession(): Promise<SessionSnapshot> {
      return expectJson(await fetch(`${baseUrl}/session`));
    },

    async writeSession(session: SessionSnapshot) {
      await expectJson(await fetch(`${baseUrl}/session`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session),
      }));
    },

    listAnnotations,
    replaceAnnotations,

    async createAnnotation(documentId: string, input: AnnotationCreateInput) {
      const now = Date.now();
      const created: Annotation = {
        id: crypto.randomUUID(),
        page: input.page,
        kind: input.kind,
        payload: input.payload,
        createdAt: now,
        updatedAt: now,
      };
      await mutateAnnotations(documentId, (rows) => [...rows, created]);
      return created;
    },

    async deleteAnnotation(documentId: string, annotationId: string) {
      const current = await listAnnotations(documentId);
      if (!current.some((item) => item.id === annotationId)) return false;
      await mutateAnnotations(documentId, (rows) => rows.filter((item) => item.id !== annotationId));
      return true;
    },

    async updateAnnotation(documentId: string, annotationId: string, payload: Record<string, unknown>) {
      let updated: Annotation | null = null;
      await mutateAnnotations(documentId, (rows) => rows.map((item) => {
        if (item.id !== annotationId) return item;
        updated = { ...item, payload: { ...item.payload, ...payload }, updatedAt: Date.now() };
        return updated;
      }));
      return updated;
    },

    async undoAnnotation(documentId: string) {
      const undo = annotationUndo.get(documentId) ?? [];
      const previous = undo.pop();
      if (!previous) return listAnnotations(documentId);
      const current = await listAnnotations(documentId);
      const redo = annotationRedo.get(documentId) ?? [];
      redo.push(current);
      annotationRedo.set(documentId, redo);
      annotationUndo.set(documentId, undo);
      return replaceAnnotations(documentId, previous);
    },

    async redoAnnotation(documentId: string) {
      const redo = annotationRedo.get(documentId) ?? [];
      const next = redo.pop();
      if (!next) return listAnnotations(documentId);
      const current = await listAnnotations(documentId);
      const undo = annotationUndo.get(documentId) ?? [];
      undo.push(current);
      annotationUndo.set(documentId, undo);
      annotationRedo.set(documentId, redo);
      return replaceAnnotations(documentId, next);
    },

    async enqueueOcr(filePath: string, language?: string): Promise<OcrJob> {
      return serverOcr.enqueueOcr(filePath, language);
    },

    async runOcr(jobId: string, inputBytes?: Uint8Array) {
      return serverOcr.runOcr(jobId, inputBytes);
    },

    async listOcrJobs() {
      return serverOcr.listOcrJobs();
    },

    async cancelOcr(jobId: string) {
      return serverOcr.cancelOcr(jobId);
    },

    async inspectP12Certificate(certificateBytes, passphrase) {
      return serverSigning.inspectP12Certificate(certificateBytes, passphrase);
    },

    async inspectPdfSignatures(pdfBytes) {
      return serverSigning.inspectPdfSignatures(pdfBytes);
    },

    async signPdfP12(pdfBytes, certificateBytes, options) {
      return serverSigning.signPdfP12(pdfBytes, certificateBytes, options);
    },

    async insertPages(bytes: Uint8Array, opts: InsertOptions) {
      return browser.insertPages(bytes, opts);
    },
    async cropPage(bytes: Uint8Array, opts: CropOptions) {
      return browser.cropPage(bytes, opts);
    },
    async addPageNumbers(bytes: Uint8Array, opts: PageNumbers) {
      return browser.addPageNumbers(bytes, opts);
    },
    async addHeaderFooter(bytes: Uint8Array, lines: HeaderFooterLine[], isHeader: boolean) {
      return browser.addHeaderFooter(bytes, lines, isHeader);
    },
  };
}

export async function uploadPdfToServer(file: Blob, fileName: string, baseUrl = "/api/opdf") {
  const response = await fetch(`${baseUrl}/documents?name=${encodeURIComponent(fileName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: file,
  });
  return expectJson<ServerUploadResult>(response);
}

export async function fetchServerPdfBlob(filePath: string, baseUrl = "/api/opdf") {
  const id = parseServerId(filePath);
  if (!id) throw new Error("Invalid server document reference.");
  const response = await fetch(`${baseUrl}/documents/${id}`);
  if (!response.ok) throw new Error(`Unable to load server document: HTTP ${response.status}`);
  return response.blob();
}
