import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { OcrService } from "@opdf/core";
import { createPdfiumOcrRenderer } from "./opdf-ocr-renderer.mjs";

function publicJob(job) {
  if (!job) return null;
  const { outputBytes: _outputBytes, outputPath: _outputPath, ...rest } = job;
  return rest;
}

export function createOcrJobQueue(dataDir, options = {}) {
  const service = new OcrService();
  const root = resolve(dataDir, "ocr");
  const concurrency = Math.max(1, Math.min(Number(options.concurrency || 1), 2));
  const pending = [];
  const inputs = new Map();
  let active = 0;

  async function ensure() {
    await mkdir(root, { recursive: true });
  }

  async function cleanupInput(jobId) {
    const inputPath = inputs.get(jobId);
    inputs.delete(jobId);
    if (inputPath) await rm(inputPath, { force: true }).catch(() => {});
  }

  async function runJob(jobId) {
    const job = service.get(jobId);
    const inputPath = inputs.get(jobId);
    if (!job || !inputPath || job.status === "cancelled") {
      await cleanupInput(jobId);
      return;
    }

    active += 1;
    let renderer;
    try {
      const bytes = new Uint8Array(await readFile(inputPath));
      renderer = await createPdfiumOcrRenderer(bytes);
      const result = await service.run(jobId, bytes, {
        getNativeText: (pageIndex) => renderer.getNativeText(pageIndex),
        renderPage: (pageIndex) => renderer.renderPage(pageIndex),
        isCancelled: () => service.get(jobId)?.status === "cancelled",
      });
      if (result?.status === "done" && result.outputBytes?.length) {
        const jobDir = join(root, jobId);
        const outputPath = join(jobDir, "output.pdf");
        await mkdir(jobDir, { recursive: true });
        await writeFile(outputPath, result.outputBytes);
        result.outputPath = outputPath;
        result.outputBytes = undefined;
      }
    } catch (error) {
      const current = service.get(jobId);
      if (current && current.status !== "cancelled") {
        current.status = "failed";
        current.error = error instanceof Error ? error.message : "OCR failed";
      }
    } finally {
      await renderer?.close?.().catch(() => {});
      await cleanupInput(jobId);
      active -= 1;
      void pump();
    }
  }

  async function pump() {
    while (active < concurrency && pending.length > 0) {
      const jobId = pending.shift();
      if (!jobId) continue;
      const job = service.get(jobId);
      if (!job || job.status === "cancelled") {
        await cleanupInput(jobId);
        continue;
      }
      void runJob(jobId);
    }
  }

  return {
    async ensure() {
      await ensure();
    },

    enqueue(filePath, language = "eng+vie") {
      return publicJob(service.enqueue(filePath, language));
    },

    async submit(jobId, inputPath) {
      const job = service.get(jobId);
      if (!job) return null;
      if (job.status !== "queued") return publicJob(job);
      inputs.set(jobId, inputPath);
      pending.push(jobId);
      void pump();
      return publicJob(job);
    },

    list() {
      return service.list().map(publicJob);
    },

    get(jobId) {
      return publicJob(service.get(jobId));
    },

    cancel(jobId) {
      const job = service.cancel(jobId);
      if (job?.status === "cancelled") {
        const index = pending.indexOf(jobId);
        if (index >= 0) pending.splice(index, 1);
        void cleanupInput(jobId);
      }
      return publicJob(job);
    },

    async getOutput(jobId) {
      const job = service.get(jobId);
      if (!job || job.status !== "done" || !job.outputPath) return null;
      return {
        path: job.outputPath,
        bytes: await readFile(job.outputPath),
      };
    },
  };
}
