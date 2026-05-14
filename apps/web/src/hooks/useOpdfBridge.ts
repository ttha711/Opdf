import { useMemo } from "react";
import type { Annotation, AnnotationCreateInput, OcrJob, OpenDocumentResult, RecentDocument, SessionSnapshot } from "@opdf/core";
import type { OpdfBridge } from "../types/opdf";

function createMockBridge(): OpdfBridge {
  let recents: RecentDocument[] = [];
  let session: SessionSnapshot = {
    activeFilePath: null,
    openTabs: [],
    activeTabIndex: 0,
    updatedAt: Date.now(),
  };
  const annotations = new Map<string, Annotation[]>();
  const ocrJobs = new Map<string, OcrJob>();

  return {
    async openProjectFolder() {
      return false;
    },
    async pickAndOpenDocument() {
      return null;
    },
    async openDocument(_filePath: string): Promise<OpenDocumentResult> {
      throw new Error("openDocument requires desktop runtime. Use local file input in web dev.");
    },
    async saveDocument() {},
    async saveDocumentAs() {
      return null;
    },
    async getRecent() {
      return recents;
    },
    async pushRecent(filePath) {
      recents = [{ filePath, openedAt: Date.now() }, ...recents.filter((r) => r.filePath !== filePath)];
    },
    async restoreSession() {
      return session;
    },
    async writeSession(nextSession) {
      session = nextSession;
    },
    async listAnnotations(documentId) {
      return annotations.get(documentId) ?? [];
    },
    async createAnnotation(documentId, input: AnnotationCreateInput) {
      const next: Annotation = {
        id: crypto.randomUUID(),
        kind: input.kind,
        page: input.page,
        payload: input.payload,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const current = annotations.get(documentId) ?? [];
      annotations.set(documentId, [...current, next]);
      return next;
    },
    async deleteAnnotation(documentId, id) {
      const current = annotations.get(documentId) ?? [];
      annotations.set(documentId, current.filter((a) => a.id !== id));
      return current.some((a) => a.id === id);
    },
    async undoAnnotation(documentId) {
      return annotations.get(documentId) ?? [];
    },
    async redoAnnotation(documentId) {
      return annotations.get(documentId) ?? [];
    },
    async enqueueOcr(filePath, language = "eng+vie") {
      const job: OcrJob = {
        id: crypto.randomUUID(),
        filePath,
        language,
        status: "queued",
        progress: 0,
      };
      ocrJobs.set(job.id, job);
      return job;
    },
    async runOcr(jobId) {
      const job = ocrJobs.get(jobId);
      if (!job) {
        return null;
      }
      job.status = "done";
      job.progress = 100;
      job.outputPath = job.filePath;
      return job;
    },
    async listOcrJobs() {
      return [...ocrJobs.values()];
    },
  };
}

export function useOpdfBridge(): OpdfBridge {
  return useMemo(() => window.opdf ?? createMockBridge(), []);
}
