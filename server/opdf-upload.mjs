import { appendFile, open, readFile, rename, rm, stat } from "node:fs/promises";

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
  if (pathname === "/api/opdf/uploads") return { id: null, action: "create", chunkIndex: null };
  const match = pathname.match(
    /^\/api\/opdf\/uploads\/([0-9a-f-]{36})(?:\/(complete|chunks(?:\/(\d+))?))?$/i,
  );
  if (!match) return null;
  if (match[2]?.startsWith("chunks/")) {
    return { id: match[1], action: "chunk", chunkIndex: Number(match[3]) };
  }
  return { id: match[1], action: match[2] || "session", chunkIndex: null };
}

function chunkPath(record, index) {
  return `${record.tempPath}.part-${index}`;
}

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function uploadPayload(record, expectedSize, chunkBytes, uploadedChunks = [], complete = false) {
  return {
    id: record.id,
    fileName: record.fileName,
    filePath: record.filePath,
    expectedSize,
    chunkBytes,
    uploadedChunks,
    complete,
  };
}

async function assembleChunks(record, expectedSize, chunkBytes) {
  const totalChunks = Math.ceil(expectedSize / chunkBytes);
  await rm(record.tempPath, { force: true });
  try {
    for (let index = 0; index < totalChunks; index += 1) {
      const path = chunkPath(record, index);
      const part = await readFile(path);
      const expected = index === totalChunks - 1
        ? expectedSize - (index * chunkBytes)
        : chunkBytes;
      if (part.byteLength !== expected) {
        throw new Error(`Upload chunk ${index} has an invalid size.`);
      }
      await appendFile(record.tempPath, part);
    }
    const assembledSize = await fileSize(record.tempPath);
    if (assembledSize !== expectedSize) throw new Error("Assembled upload size does not match.");

    const handle = await open(record.tempPath, "r");
    const signature = Buffer.alloc(5);
    try {
      await handle.read(signature, 0, 5, 0);
    } finally {
      await handle.close();
    }
    if (signature.toString("ascii") !== "%PDF-") throw new Error("Payload is not a PDF.");

    await rename(record.tempPath, record.pdfPath);
    for (let index = 0; index < totalChunks; index += 1) {
      await rm(chunkPath(record, index), { force: true });
    }
  } catch (error) {
    await rm(record.tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export function createChunkUploadApi({
  storage,
  maxBytes,
  chunkBytes,
  sendJson,
  sendError,
  assertCanAdd,
}) {
  return async function handleChunkUpload(req, res, url) {
    const route = uploadRoute(url.pathname);
    if (!route) return false;

    if (route.action === "create") {
      if (req.method !== "POST") {
        sendError(res, 405, "Method not allowed.");
        return true;
      }
      const expectedSize = Number(url.searchParams.get("size") || 0);
      if (!Number.isInteger(expectedSize) || expectedSize <= 0 || expectedSize > maxBytes) {
        sendError(res, expectedSize > maxBytes ? 413 : 400, "A valid upload size is required.");
        return true;
      }
      if (assertCanAdd) await assertCanAdd(expectedSize);
      const record = await storage.createDocument(
        url.searchParams.get("name") || "document.pdf",
        expectedSize,
      );
      sendJson(res, 201, uploadPayload(record, expectedSize, chunkBytes));
      return true;
    }

    const record = await storage.getDocument(route.id);
    if (!record) {
      sendError(res, 404, "Upload session not found.");
      return true;
    }

    const completedSize = await storage.getDocumentSize(record.id);
    const expectedSize = Number(record.uploadExpectedSize || completedSize || 0);
    if (!Number.isInteger(expectedSize) || expectedSize <= 0 || expectedSize > maxBytes) {
      sendError(res, 409, "Upload session metadata is invalid.");
      return true;
    }
    const totalChunks = Math.ceil(expectedSize / chunkBytes);

    if (route.action === "session" && req.method === "GET") {
      if (completedSize != null) {
        sendJson(res, 200, uploadPayload(record, completedSize, chunkBytes, [], true));
        return true;
      }
      const uploadedChunks = storage.multipartUploads
        ? await storage.listUploadedChunks(record.id)
        : [];
      if (!storage.multipartUploads) {
        for (let index = 0; index < totalChunks; index += 1) {
          if (await fileSize(chunkPath(record, index)) != null) uploadedChunks.push(index);
        }
      }
      sendJson(res, 200, uploadPayload(record, expectedSize, chunkBytes, uploadedChunks));
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

    if (route.action === "chunk" && req.method === "PUT") {
      const index = route.chunkIndex;
      if (!Number.isInteger(index) || index < 0 || index >= totalChunks) {
        sendError(res, 400, "Invalid upload chunk index.");
        return true;
      }
      if (completedSize != null) {
        sendError(res, 409, "Upload is already complete.");
        return true;
      }

      const part = await readChunk(req, chunkBytes);
      const expected = index === totalChunks - 1
        ? expectedSize - (index * chunkBytes)
        : chunkBytes;
      if (part.byteLength !== expected) {
        sendError(res, 400, "Upload chunk size does not match expected range.");
        return true;
      }
      if (index === 0 && part.subarray(0, 5).toString("ascii") !== "%PDF-") {
        sendError(res, 400, "Payload is not a PDF.");
        return true;
      }

      if (storage.multipartUploads) {
        await storage.putUploadChunk(record.id, index, part);
      } else {
        const path = chunkPath(record, index);
        await rm(path, { force: true }).catch(() => {});
        const handle = await open(path, "wx");
        try {
          await handle.write(part);
        } finally {
          await handle.close();
        }
      }
      sendJson(res, 200, { id: record.id, chunkIndex: index, received: part.byteLength });
      return true;
    }

    if (route.action === "complete" && req.method === "POST") {
      if (completedSize != null) {
        if (completedSize !== expectedSize) {
          sendError(res, 409, "Stored document size does not match upload size.");
          return true;
        }
      } else if (storage.multipartUploads) {
        const uploaded = await storage.listUploadedChunks(record.id);
        for (let index = 0; index < totalChunks; index += 1) {
          if (!uploaded.includes(index)) {
            sendJson(res, 409, { error: "Upload is incomplete.", missingChunk: index });
            return true;
          }
        }
      } else {
        for (let index = 0; index < totalChunks; index += 1) {
          if (await fileSize(chunkPath(record, index)) == null) {
            sendJson(res, 409, { error: "Upload is incomplete.", missingChunk: index });
            return true;
          }
        }
        await assembleChunks(record, expectedSize, chunkBytes);
      }

      const updated = completedSize != null
        ? record
        : storage.multipartUploads
          ? await storage.completeUpload(record.id, expectedSize, chunkBytes)
          : await storage.finalizeDocument(record.id, expectedSize);
      await storage.pushRecent(updated.filePath);
      sendJson(res, 201, {
        ...uploadPayload(updated, expectedSize, chunkBytes, [], true),
        size: expectedSize,
        openedAt: Date.now(),
      });
      return true;
    }

    sendError(res, 405, "Method not allowed.");
    return true;
  };
}
