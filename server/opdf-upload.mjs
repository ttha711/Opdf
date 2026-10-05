import { appendFile, readFile, rename, stat } from "node:fs/promises";

async function readChunk(req, limit) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new Error("Upload chunk exceeds OPDF_UPLOAD_CHUNK_BYTES.");
    chunks.push(chunk);
  }
  if (total === 0) throw new Error("Upload chunk is empty.");
  return Buffer.concat(chunks);
}

function uploadRoute(pathname) {
  if (pathname === "/api/opdf/uploads") return { id: null, action: "create" };
  const match = pathname.match(/^\/api\/opdf\/uploads\/([0-9a-f-]{36})(?:\/(complete))?$/i);
  if (!match) return null;
  return { id: match[1], action: match[2] || "session" };
}

async function currentUploadSize(path) {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
}

function uploadPayload(record, received, chunkBytes, complete = false) {
  return {
    id: record.id,
    fileName: record.fileName,
    filePath: record.filePath,
    received,
    chunkBytes,
    complete,
  };
}

export function createChunkUploadApi({
  storage,
  maxBytes,
  chunkBytes,
  sendJson,
  sendError,
}) {
  return async function handleChunkUpload(req, res, url) {
    const route = uploadRoute(url.pathname);
    if (!route) return false;

    if (route.action === "create") {
      if (req.method !== "POST") {
        sendError(res, 405, "Method not allowed.");
        return true;
      }
      const requestedSize = Number(url.searchParams.get("size") || 0);
      if (!Number.isFinite(requestedSize) || requestedSize <= 0) {
        sendError(res, 400, "Upload size is required.");
        return true;
      }
      if (requestedSize > maxBytes) {
        sendError(res, 413, "Upload exceeds OPDF_MAX_UPLOAD_BYTES.");
        return true;
      }
      const record = await storage.createDocument(url.searchParams.get("name") || "document.pdf");
      sendJson(res, 201, uploadPayload(record, 0, chunkBytes));
      return true;
    }

    const record = await storage.getDocument(route.id);
    if (!record) {
      sendError(res, 404, "Upload session not found.");
      return true;
    }

    const completedSize = await storage.getDocumentSize(record.id);
    if (route.action === "session" && req.method === "GET") {
      if (completedSize != null) {
        sendJson(res, 200, uploadPayload(record, completedSize, chunkBytes, true));
        return true;
      }
      const received = await currentUploadSize(record.tempPath);
      sendJson(res, 200, uploadPayload(record, received, chunkBytes));
      return true;
    }

    if (route.action === "session" && req.method === "DELETE") {
      if (completedSize != null) {
        sendError(res, 409, "Completed documents cannot be cancelled as uploads.");
        return true;
      }
      await storage.removeDocument(record.id);
      sendJson(res, 200, { cancelled: true, id: record.id });
      return true;
    }

    if (route.action === "session" && req.method === "PUT") {
      if (completedSize != null) {
        sendError(res, 409, "Upload is already complete.");
        return true;
      }
      const expectedOffset = Number(url.searchParams.get("offset"));
      const received = await currentUploadSize(record.tempPath);
      if (!Number.isInteger(expectedOffset) || expectedOffset < 0) {
        sendError(res, 400, "A valid upload offset is required.");
        return true;
      }
      if (expectedOffset !== received) {
        sendJson(res, 409, {
          error: "Upload offset does not match server state.",
          received,
        });
        return true;
      }

      const chunk = await readChunk(req, chunkBytes);
      if (received + chunk.byteLength > maxBytes) {
        sendError(res, 413, "Upload exceeds OPDF_MAX_UPLOAD_BYTES.");
        return true;
      }
      if (received === 0 && chunk.subarray(0, 5).toString("ascii") !== "%PDF-") {
        sendError(res, 400, "Payload is not a PDF.");
        return true;
      }
      await appendFile(record.tempPath, chunk);
      sendJson(res, 200, uploadPayload(record, received + chunk.byteLength, chunkBytes));
      return true;
    }

    if (route.action === "complete" && req.method === "POST") {
      const expectedSize = Number(url.searchParams.get("size"));
      if (!Number.isInteger(expectedSize) || expectedSize <= 0 || expectedSize > maxBytes) {
        sendError(res, 400, "A valid final upload size is required.");
        return true;
      }
      if (completedSize != null) {
        if (completedSize !== expectedSize) {
          sendError(res, 409, "Stored document size does not match upload size.");
          return true;
        }
        sendJson(res, 200, {
          ...uploadPayload(record, completedSize, chunkBytes, true),
          size: completedSize,
          openedAt: Date.now(),
        });
        return true;
      }

      const received = await currentUploadSize(record.tempPath);
      if (received !== expectedSize) {
        sendJson(res, 409, {
          error: "Upload is incomplete.",
          received,
          expectedSize,
        });
        return true;
      }
      const signature = (await readFile(record.tempPath)).subarray(0, 5).toString("ascii");
      if (signature !== "%PDF-") {
        sendError(res, 400, "Payload is not a PDF.");
        return true;
      }

      await rename(record.tempPath, record.pdfPath);
      const updated = await storage.finalizeDocument(record.id, received);
      await storage.pushRecent(updated.filePath);
      sendJson(res, 201, {
        ...uploadPayload(updated, received, chunkBytes, true),
        size: updated.size,
        openedAt: Date.now(),
      });
      return true;
    }

    sendError(res, 405, "Method not allowed.");
    return true;
  };
}
