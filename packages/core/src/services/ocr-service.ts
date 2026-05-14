import { randomUUID } from "node:crypto";
import type { OcrJob } from "../types/index.js";

export class OcrService {
  private readonly jobs = new Map<string, OcrJob>();

  enqueue(filePath: string, language = "eng+vie"): OcrJob {
    const job: OcrJob = {
      id: randomUUID(),
      filePath,
      language,
      status: "queued",
      progress: 0,
    };

    this.jobs.set(job.id, job);
    return job;
  }

  list(): OcrJob[] {
    return [...this.jobs.values()];
  }

  get(id: string): OcrJob | null {
    return this.jobs.get(id) ?? null;
  }

  cancel(id: string): OcrJob | null {
    const job = this.jobs.get(id);
    if (!job) {
      return null;
    }

    if (job.status === "done" || job.status === "failed") {
      return job;
    }

    job.status = "cancelled";
    return job;
  }

  async runLocalMock(id: string): Promise<OcrJob | null> {
    const initialJob = this.jobs.get(id);
    if (!initialJob || initialJob.status === "cancelled") {
      return initialJob ?? null;
    }

    initialJob.status = "running";
    for (const progress of [20, 40, 60, 80, 100]) {
      const current = this.jobs.get(id);
      if (!current || current.status === "cancelled") {
        return current ?? null;
      }
      current.progress = progress;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    const doneJob = this.jobs.get(id);
    if (!doneJob) {
      return null;
    }
    doneJob.status = "done";
    doneJob.outputPath = doneJob.filePath;
    return doneJob;
  }

  applyTextLayer(filePath: string, _ocrText: string): string {
    return filePath;
  }
}
