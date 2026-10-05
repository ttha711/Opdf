import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  assertDocumentId,
  sanitizeFileName,
  toServerFilePath,
} from "./opdf-storage.mjs";

function contentKey(prefix, relative) {
  return prefix ? `${prefix.replace(/\/$/, "")}/${relative}` : relative;
}

async function readJsonFile(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

export function createS3OpdfStorage(rootDir, objectStore, remotePrefix) {
  const root = resolve(rootDir);
  const documentsRoot = join(root, "documents");
  const recentsPath = join(root, "recents.json");
  const sessionPath = join(root, "session.json");

  const docDir = (id) => join(documentsRoot, assertDocumentId(id));
  const pdfPath = (id) => join(docDir(id), "document.pdf");
  const metaPath = (id) => join(docDir(id), "meta.json");
  const annotationsPath = (id) => join(docDir(id), "annotations.json");
  const uploadPath = (id) => join(docDir(id), "upload.tmp");
  const remoteStatePath = (id) => join(docDir(id), "document.remote.json");

  const key = (relative) => contentKey(remotePrefix, relative);
  const documentKey = (id) => key(`documents/${assertDocumentId(id)}/document.pdf`);
  const metaKey = (id) => key(`documents/${assertDocumentId(id)}/meta.json`);
  const annotationsKey = (id) => key(`documents/${assertDocumentId(id)}/annotations.json`);

  async function ensure() {
    await mkdir(documentsRoot, { recursive: true });
  }

  async function writeJsonRemote(path, remoteKey, value) {
    await mkdir(resolve(path, ".."), { recursive: true });
    const text = JSON.stringify(value, null, 2) + "\n";
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, text, "utf8");
    await rename(temp, path);
    await objectStore.put(remoteKey, Buffer.from(text, "utf8"), "application/json");
  }

  async function readJsonRemote(path, remoteKey, fallback) {
    const bytes = await objectStore.get(remoteKey);
    if (!bytes) return fallback;
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, bytes);
    try {
      return JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new Error(`Remote OPDF metadata is corrupt: ${remoteKey}`);
    }
  }

  async function syncDocumentCache(id) {
    const safeId = assertDocumentId(id);
    const remote = await objectStore.head(documentKey(safeId));
    if (!remote) return false;
    const state = await readJsonFile(remoteStatePath(safeId), {});
    const local = await stat(pdfPath(safeId)).catch(() => null);
    if (
      local?.isFile() &&
      local.size === remote.size &&
      state?.etag &&
      state.etag === remote.etag
    ) {
      return true;
    }

    await mkdir(docDir(safeId), { recursive: true });
    const temp = `${pdfPath(safeId)}.${randomUUID()}.download`;
    const downloaded = await objectStore.getToFile(documentKey(safeId), temp);
    if (!downloaded) return false;
    await rename(temp, pdfPath(safeId));
    await writeFile(
      remoteStatePath(safeId),
      JSON.stringify({ etag: remote.etag, size: remote.size }, null, 2) + "\n",
      "utf8",
    );
    return true;
  }

  async function createDocument(fileName, uploadExpectedSize = null) {
    await ensure();
    const id = randomUUID();
    const name = sanitizeFileName(fileName);
    const now = Date.now();
    const meta = {
      id,
      fileName: name,
      size: 0,
      createdAt: now,
      updatedAt: now,
      ...(Number.isInteger(uploadExpectedSize) && uploadExpectedSize > 0 ? { uploadExpectedSize } : {}),
    };

    await mkdir(docDir(id), { recursive: true });
    if (meta.uploadExpectedSize) {
      meta.multipartUploadId = await objectStore.createMultipart(documentKey(id), "application/pdf");
    }
    await writeJsonRemote(metaPath(id), metaKey(id), meta);
    return {
      ...meta,
      filePath: toServerFilePath(id, name),
      pdfPath: pdfPath(id),
      tempPath: uploadPath(id),
    };
  }

  async function getDocument(id) {
    const safeId = assertDocumentId(id);
    const meta = await readJsonRemote(metaPath(safeId), metaKey(safeId), null);
    if (!meta) return null;
    if (!meta.uploadExpectedSize) await syncDocumentCache(safeId);
    return {
      ...meta,
      filePath: toServerFilePath(safeId, meta.fileName),
      pdfPath: pdfPath(safeId),
      tempPath: uploadPath(safeId),
    };
  }

  async function finalizeDocument(id, size) {
    const safeId = assertDocumentId(id);
    const current = await readJsonRemote(metaPath(safeId), metaKey(safeId), null);
    if (!current) throw new Error("Document not found.");

    let remote;
    if (current.multipartUploadId) {
      remote = await objectStore.head(documentKey(safeId));
      if (!remote) throw new Error("Completed multipart document is missing from object storage.");
    } else {
      remote = await objectStore.putFile(documentKey(safeId), pdfPath(safeId), size, "application/pdf");
    }

    const next = {
      id: safeId,
      fileName: current.fileName,
      size,
      createdAt: current.createdAt,
      updatedAt: Date.now(),
    };
    await writeJsonRemote(metaPath(safeId), metaKey(safeId), next);
    if (remote?.etag) {
      await writeFile(
        remoteStatePath(safeId),
        JSON.stringify({ etag: remote.etag, size }, null, 2) + "\n",
        "utf8",
      );
    }
    return getDocument(safeId);
  }

  async function removeDocument(id) {
    const safeId = assertDocumentId(id);
    const meta = await readJsonRemote(metaPath(safeId), metaKey(safeId), null);
    if (meta?.multipartUploadId) {
      await objectStore.abortMultipart(documentKey(safeId), meta.multipartUploadId).catch(() => {});
    }
    const objects = await objectStore.list(key(`documents/${safeId}/`));
    for (const item of objects) await objectStore.remove(item.key);
    await rm(docDir(safeId), { recursive: true, force: true });
  }

  async function getRecents() {
    const rows = await readJsonRemote(recentsPath, key("recents.json"), []);
    return Array.isArray(rows) ? rows : [];
  }

  async function pushRecent(filePath) {
    const current = await getRecents();
    const next = [
      { filePath, openedAt: Date.now() },
      ...current.filter((item) => item?.filePath !== filePath),
    ].slice(0, 30);
    await writeJsonRemote(recentsPath, key("recents.json"), next);
    return next;
  }

  async function getSession() {
    return readJsonRemote(sessionPath, key("session.json"), {
      activeFilePath: null,
      openTabs: [],
      activeTabIndex: 0,
      updatedAt: Date.now(),
    });
  }

  async function putSession(session) {
    const next = {
      activeFilePath: typeof session?.activeFilePath === "string" ? session.activeFilePath : null,
      openTabs: Array.isArray(session?.openTabs)
        ? session.openTabs.filter((value) => typeof value === "string").slice(0, 50)
        : [],
      activeTabIndex: Number.isInteger(session?.activeTabIndex) ? session.activeTabIndex : 0,
      updatedAt: Date.now(),
    };
    await writeJsonRemote(sessionPath, key("session.json"), next);
    return next;
  }

  async function getAnnotations(id) {
    const safeId = assertDocumentId(id);
    const rows = await readJsonRemote(annotationsPath(safeId), annotationsKey(safeId), []);
    return Array.isArray(rows) ? rows : [];
  }

  async function putAnnotations(id, annotations) {
    const safeId = assertDocumentId(id);
    if (!Array.isArray(annotations)) throw new Error("annotations must be an array.");
    if (annotations.length > 10000) throw new Error("Too many annotations.");
    await writeJsonRemote(annotationsPath(safeId), annotationsKey(safeId), annotations);
    return annotations;
  }

  async function getDocumentSize(id) {
    const remote = await objectStore.head(documentKey(assertDocumentId(id)));
    return remote?.size ?? null;
  }

  async function getUploadSize(id) {
    const record = await getDocument(id);
    return record?.uploadExpectedSize ?? null;
  }

  async function listUploadedChunks(id) {
    const record = await getDocument(id);
    if (!record?.multipartUploadId) return [];
    const parts = await objectStore.listParts(documentKey(id), record.multipartUploadId);
    return parts.map((part) => part.partNumber - 1);
  }

  async function putUploadChunk(id, index, bytes) {
    const record = await getDocument(id);
    if (!record?.multipartUploadId) throw new Error("Multipart upload session not found.");
    return objectStore.uploadPart(documentKey(id), record.multipartUploadId, index + 1, bytes);
  }

  async function completeUpload(id, expectedSize, chunkBytes) {
    const record = await getDocument(id);
    if (!record?.multipartUploadId) throw new Error("Multipart upload session not found.");
    const parts = await objectStore.listParts(documentKey(id), record.multipartUploadId);
    const totalChunks = Math.ceil(expectedSize / chunkBytes);
    if (parts.length !== totalChunks) throw new Error("Upload is incomplete.");
    for (let index = 0; index < totalChunks; index += 1) {
      const part = parts.find((item) => item.partNumber === index + 1);
      const expected = index === totalChunks - 1
        ? expectedSize - index * chunkBytes
        : chunkBytes;
      if (!part || part.size !== expected) throw new Error(`Upload chunk ${index} has an invalid size.`);
    }
    await objectStore.completeMultipart(documentKey(id), record.multipartUploadId, parts);
    return finalizeDocument(id, expectedSize);
  }

  return {
    root,
    multipartUploads: true,
    ensure,
    createDocument,
    getDocument,
    finalizeDocument,
    removeDocument,
    getRecents,
    pushRecent,
    getSession,
    putSession,
    getAnnotations,
    putAnnotations,
    getDocumentSize,
    getUploadSize,
    listUploadedChunks,
    putUploadChunk,
    completeUpload,
  };
}
