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

  async run(id: string): Promise<OcrJob | null> {
    const job = this.jobs.get(id);
    if (!job || job.status === "cancelled") {
      return job ?? null;
    }

    job.status = "running";
    
    try {
      const Tesseract = await import("tesseract.js");
      const worker = await Tesseract.createWorker(job.language, 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            job.progress = 20 + Math.floor(m.progress * 70);
          }
        }
      });
      job.progress = 20;
      
      // Note: In a full PDF pipeline, we would convert PDF pages to images first.
      // Here we assume filePath is an image or tesseract can handle it.
      const ret = await worker.recognize(job.filePath);
      
      job.progress = 100;
      job.status = "done";
      job.outputPath = job.filePath; // Placeholder for actual PDF generation with text layer
      
      await worker.terminate();
    } catch (error) {
      job.status = "failed";
    }

    return job;
  }

  applyTextLayer(filePath: string, _ocrText: string): string {
    return filePath;
  }
}
