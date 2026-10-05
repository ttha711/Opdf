export type ServerUploadSession = {
  id: string;
  filePath: string;
  expectedSize: number;
  chunkBytes: number;
  uploadedChunks: number[];
};

export type ServerUploadResult = ServerUploadSession & {
  fileName: string;
  size: number;
  openedAt: number;
  complete: true;
};

type UploadOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
  session?: ServerUploadSession | null;
  concurrency?: number;
  onSession?: (session: ServerUploadSession) => void;
  onProgress?: (loaded: number, total: number) => void;
};

type UploadStatus = ServerUploadSession & {
  fileName: string;
  complete: boolean;
};

function normalizeBase(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

async function jsonOrError<T>(response: Response): Promise<T> {
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

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Upload cancelled.", "AbortError"));
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Upload cancelled.", "AbortError"));
    }, { once: true });
  });
}

async function createSession(file: File, fileName: string, baseUrl: string, signal?: AbortSignal) {
  const response = await fetch(
    `${baseUrl}/uploads?name=${encodeURIComponent(fileName)}&size=${file.size}`,
    { method: "POST", signal },
  );
  return jsonOrError<UploadStatus>(response);
}

async function readSession(
  session: ServerUploadSession,
  fileSize: number,
  baseUrl: string,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `${baseUrl}/uploads/${session.id}?size=${fileSize}`,
    { signal },
  );
  if (response.status === 404) return null;
  return jsonOrError<UploadStatus>(response);
}

async function putChunk(
  baseUrl: string,
  session: ServerUploadSession,
  file: File,
  index: number,
  signal?: AbortSignal,
) {
  const start = index * session.chunkBytes;
  const end = Math.min(file.size, start + session.chunkBytes);
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(
        `${baseUrl}/uploads/${session.id}/chunks/${index}?size=${file.size}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: file.slice(start, end),
          signal,
        },
      );
      if (response.ok) return;
      if (response.status < 500 || attempt === 2) await jsonOrError(response);
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      if (attempt === 2) throw error;
    }
    await sleep(300 * (2 ** attempt), signal);
  }
  throw lastError instanceof Error ? lastError : new Error("Chunk upload failed.");
}

function uploadedBytes(session: ServerUploadSession, fileSize: number) {
  return session.uploadedChunks.reduce((total, index) => {
    const start = index * session.chunkBytes;
    return total + Math.max(0, Math.min(session.chunkBytes, fileSize - start));
  }, 0);
}

export async function uploadPdfToServer(
  file: File,
  fileName: string,
  options: UploadOptions = {},
): Promise<ServerUploadResult> {
  const baseUrl = normalizeBase(options.baseUrl || "/api/opdf");
  const concurrency = Math.max(1, Math.min(6, options.concurrency ?? 4));
  let status = options.session
    ? await readSession(options.session, file.size, baseUrl, options.signal)
    : null;

  if (!status) status = await createSession(file, fileName, baseUrl, options.signal);
  if (status.complete) return status as ServerUploadResult;

  const uploaded = new Set(status.uploadedChunks ?? []);
  let session: ServerUploadSession = {
    id: status.id,
    filePath: status.filePath,
    expectedSize: file.size,
    chunkBytes: status.chunkBytes,
    uploadedChunks: [...uploaded].sort((a, b) => a - b),
  };
  options.onSession?.(session);
  options.onProgress?.(uploadedBytes(session, file.size), file.size);

  const totalChunks = Math.ceil(file.size / session.chunkBytes);
  const pending = Array.from({ length: totalChunks }, (_, index) => index)
    .filter((index) => !uploaded.has(index));
  let cursor = 0;

  const worker = async () => {
    while (cursor < pending.length) {
      if (options.signal?.aborted) throw new DOMException("Upload cancelled.", "AbortError");
      const index = pending[cursor];
      cursor += 1;
      await putChunk(baseUrl, session, file, index, options.signal);
      uploaded.add(index);
      session = { ...session, uploadedChunks: [...uploaded].sort((a, b) => a - b) };
      options.onSession?.(session);
      options.onProgress?.(uploadedBytes(session, file.size), file.size);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, () => worker());
  const results = await Promise.allSettled(workers);
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;

  const response = await fetch(
    `${baseUrl}/uploads/${session.id}/complete?size=${file.size}`,
    { method: "POST", signal: options.signal },
  );
  return jsonOrError<ServerUploadResult>(response);
}

export async function cancelPdfUpload(
  session: ServerUploadSession | null | undefined,
  baseUrl = "/api/opdf",
) {
  if (!session) return;
  try {
    await fetch(
      `${normalizeBase(baseUrl)}/uploads/${session.id}?size=${session.expectedSize}`,
      { method: "DELETE" },
    );
  } catch {
    // Cancellation is best effort; partial uploads are never exposed as recents.
  }
}
