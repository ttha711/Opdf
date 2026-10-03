export type LargePdfOperation = "optimize" | "linearize";

export type LargePdfCapabilities = {
  streamingUpload: boolean;
  maxUploadBytes: number;
  qpdf: boolean;
  operations: LargePdfOperation[];
};

type JobStatus = "uploading" | "uploaded" | "processing" | "completed" | "failed";

type JobState = {
  id: string;
  status: JobStatus;
  operation: LargePdfOperation;
  fileName: string;
  bytesReceived?: number;
  totalBytes?: number;
  outputBytes?: number;
  error?: string;
};

const API_ROOT = "/api/pdf-jobs";

export async function getLargePdfCapabilities(signal?: AbortSignal): Promise<LargePdfCapabilities | null> {
  try {
    const response = await fetch(`${API_ROOT}/capabilities`, { signal });
    if (!response.ok) return null;
    return await response.json() as LargePdfCapabilities;
  } catch {
    return null;
  }
}

export async function runLargePdfJob(params: {
  source: Blob | Uint8Array;
  fileName: string;
  operation: LargePdfOperation;
  signal?: AbortSignal;
  onStatus?: (state: JobState) => void;
}): Promise<Uint8Array> {
  const body = params.source instanceof Blob
    ? params.source
    : new Blob([params.source as unknown as BlobPart], { type: "application/pdf" });

  const upload = await fetch(`${API_ROOT}?operation=${encodeURIComponent(params.operation)}`, {
    method: "POST",
    headers: {
      "content-type": "application/pdf",
      "x-file-name": params.fileName || "document.pdf",
    },
    body,
    signal: params.signal,
  });

  if (!upload.ok) {
    throw new Error((await upload.json().catch(() => null))?.error || `Upload failed (${upload.status})`);
  }

  const uploaded = await upload.json() as JobState;
  params.onStatus?.(uploaded);

  const start = await fetch(`${API_ROOT}/${uploaded.id}/run`, {
    method: "POST",
    signal: params.signal,
  });
  if (!start.ok) {
    const payload = await start.json().catch(() => null);
    throw new Error(payload?.error || `Job start failed (${start.status})`);
  }

  const started = await start.json() as JobState;
  params.onStatus?.(started);

  try {
    for (;;) {
      if (params.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      await new Promise<void>((resolve) => window.setTimeout(resolve, 750));

      const statusResponse = await fetch(`${API_ROOT}/${uploaded.id}`, { signal: params.signal });
      if (!statusResponse.ok) throw new Error(`Job status failed (${statusResponse.status})`);
      const state = await statusResponse.json() as JobState;
      params.onStatus?.(state);

      if (state.status === "failed") {
        throw new Error(state.error || "Large PDF job failed.");
      }
      if (state.status === "completed") {
        const result = await fetch(`${API_ROOT}/${uploaded.id}/result`, { signal: params.signal });
        if (!result.ok) throw new Error(`Result download failed (${result.status})`);
        return new Uint8Array(await result.arrayBuffer());
      }
    }
  } finally {
    void fetch(`${API_ROOT}/${uploaded.id}`, { method: "DELETE" }).catch(() => undefined);
  }
}
