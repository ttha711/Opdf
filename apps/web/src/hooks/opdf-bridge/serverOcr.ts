import type { OcrJob } from "@opdf/core";

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;
  let message = `HTTP ${response.status}`;
  try {
    const payload = await response.json() as { error?: string };
    if (payload.error) message = payload.error;
  } catch {
    // Keep HTTP fallback.
  }
  throw new Error(message);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createServerOcrClient(baseUrl: string) {
  return {
    async enqueueOcr(filePath: string, language = "eng+vie"): Promise<OcrJob> {
      return readJson<OcrJob>(await fetch(`${baseUrl}/ocr/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, language }),
      }));
    },

    async runOcr(jobId: string, inputBytes?: Uint8Array): Promise<OcrJob | null> {
      if (!inputBytes?.length) throw new Error("OCR requires loaded PDF bytes.");

      const queued = await readJson<OcrJob>(await fetch(`${baseUrl}/ocr/jobs/${jobId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: inputBytes as unknown as BodyInit,
      }));

      if (queued.status === "failed" || queued.status === "cancelled") return queued;

      const deadline = Date.now() + 30 * 60 * 1000;
      while (Date.now() < deadline) {
        const job = await readJson<OcrJob>(await fetch(`${baseUrl}/ocr/jobs/${jobId}`, {
          cache: "no-store",
        }));
        if (job.status === "done") {
          const output = await fetch(`${baseUrl}/ocr/jobs/${jobId}/output`, { cache: "no-store" });
          if (!output.ok) {
            throw new Error(`OCR output download failed: HTTP ${output.status}`);
          }
          job.outputBytes = new Uint8Array(await output.arrayBuffer());
          return job;
        }
        if (job.status === "failed" || job.status === "cancelled") return job;
        await sleep(500);
      }

      throw new Error("Server OCR timed out.");
    },

    async listOcrJobs(): Promise<OcrJob[]> {
      return readJson<OcrJob[]>(await fetch(`${baseUrl}/ocr/jobs`, { cache: "no-store" }));
    },
  };
}
