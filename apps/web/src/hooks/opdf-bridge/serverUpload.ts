export type ServerUploadSession = {
  id: string;
  filePath: string;
  received: number;
  chunkBytes: number;
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
  onSession?: (session: ServerUploadSession) => void;
  onProgress?: (loaded: number, total: number) => void;
};

type UploadStatus = ServerUploadSession & {
  fileName: string;
  complete: boolean;
  size?: number;
  openedAt?: number;
};

function normalizeBase(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

async function jsonOrError<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;
  let message = `HTTP ${response.status}`;
  let payload: { error?: string; received?: number } = {};
  try {
    payload = await response.json() as typeof payload;
    if (payload.error) message = payload.error;
  } catch {
    // Keep HTTP fallback.
  }
  const error = new Error(message) as Error & { status?: number; received?: number };
  error.status = response.status;
  error.received = payload.received;
  throw error;
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

async function createSession(
  file: File,
  fileName: string,
  baseUrl: string,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `${baseUrl}/uploads?name=${encodeURIComponent(fileName)}&size=${file.size}`,
    { method: "POST", signal },
  );
  return jsonOrError<UploadStatus>(response);
}

async function readSession(
  session: ServerUploadSession,
  baseUrl: string,
  signal?: AbortSignal,
) {
  const response = await fetch(`${baseUrl}/uploads/${session.id}`, { signal });
  if (response.status === 404) return null;
  return jsonOrError<UploadStatus>(response);
}

async function putChunk(
  baseUrl: string,
  session: ServerUploadSession,
  offset: number,
  chunk: Blob,
  signal?: AbortSignal,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(
        `${baseUrl}/uploads/${session.id}?offset=${offset}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: chunk,
          signal,
        },
      );
      if (response.ok) return response.json() as Promise<UploadStatus>;
      if (response.status === 409) {
        const payload = await response.json() as UploadStatus & { received: number };
        return payload;
      }
      if (response.status < 500 || attempt === 2) {
        return jsonOrError<UploadStatus>(response);
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      if (attempt === 2) throw error;
    }
    await sleep(300 * (2 ** attempt), signal);
  }
  throw lastError instanceof Error ? lastError : new Error("Upload failed.");
}

export async function uploadPdfToServer(
  file: File,
  fileName: string,
  options: UploadOptions = {},
): Promise<ServerUploadResult> {
  const baseUrl = normalizeBase(options.baseUrl || "/api/opdf");
  let status = options.session
    ? await readSession(options.session, baseUrl, options.signal)
    : null;

  if (!status) {
    status = await createSession(file, fileName, baseUrl, options.signal);
  }
  if (status.complete) {
    return status as ServerUploadResult;
  }

  let session: ServerUploadSession = {
    id: status.id,
    filePath: status.filePath,
    received: status.received,
    chunkBytes: status.chunkBytes,
  };
  options.onSession?.(session);
  options.onProgress?.(session.received, file.size);

  let offset = session.received;
  while (offset < file.size) {
    if (options.signal?.aborted) throw new DOMException("Upload cancelled.", "AbortError");
    const end = Math.min(file.size, offset + Math.max(1024 * 1024, session.chunkBytes));
    const result = await putChunk(
      baseUrl,
      session,
      offset,
      file.slice(offset, end),
      options.signal,
    );

    const nextOffset = Number(result.received);
    if (!Number.isFinite(nextOffset) || nextOffset < 0 || nextOffset > file.size) {
      throw new Error("Server returned an invalid upload offset.");
    }
    if (nextOffset === offset && end > offset) {
      throw new Error("Upload made no progress.");
    }

    offset = nextOffset;
    session = { ...session, received: offset };
    options.onSession?.(session);
    options.onProgress?.(offset, file.size);
  }

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
    await fetch(`${normalizeBase(baseUrl)}/uploads/${session.id}`, { method: "DELETE" });
  } catch {
    // Cancellation is best effort; stale partial uploads are not exposed as recents.
  }
}
