import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TENANT_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function sanitizeFileName(value) {
  const name = String(value || "document.pdf")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 180);
  return name || "document.pdf";
}

export function assertDocumentId(id) {
  if (!UUID_RE.test(id)) throw new Error("Invalid document id.");
  return id;
}

function assertTenantId(value, label) {
  if (!TENANT_RE.test(String(value || ""))) throw new Error(`Invalid ${label}.`);
  return String(value);
}

export function toServerFilePath(id, fileName) {
  return `server://${assertDocumentId(id)}/${encodeURIComponent(sanitizeFileName(fileName))}`;
}

export function createOpdfStorage(rootDir, tenant = null) {
  const root = resolve(rootDir);
  const tenantInfo = tenant && !tenant.legacy
    ? {
        userId: assertTenantId(tenant.userId, "user id"),
        projectId: assertTenantId(tenant.projectId, "project id"),
      }
    : null;
  const documentsRoot = join(root, "documents");
  const stateRoot = tenantInfo
    ? join(root, "tenants", tenantInfo.userId, "projects", tenantInfo.projectId)
    : root;
  const recentsPath = join(stateRoot, "recents.json");
  const sessionPath = join(stateRoot, "session.json");

  const docDir = (id) => join(documentsRoot, assertDocumentId(id));
  const pdfPath = (id) => join(docDir(id), "document.pdf");
  const metaPath = (id) => join(docDir(id), "meta.json");
  const annotationsPath = (id) => join(docDir(id), "annotations.json");
  const uploadPath = (id) => join(docDir(id), "upload.tmp");

  async function ensure() {
    await mkdir(documentsRoot, { recursive: true });
    await mkdir(stateRoot, { recursive: true });
  }

  async function replaceFile(tempPath, targetPath) {
    const backupPath = `${targetPath}.${randomUUID()}.bak`;
    let hadOriginal = false;
    try {
      await rename(targetPath, backupPath);
      hadOriginal = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    try {
      await rename(tempPath, targetPath);
      if (hadOriginal) await rm(backupPath, { force: true });
    } catch (error) {
      if (hadOriginal) await rename(backupPath, targetPath).catch(() => {});
      throw error;
    }
  }

  async function writeJsonAtomic(path, value) {
    const temp = `${path}.${randomUUID()}.tmp`;
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
    await replaceFile(temp, path);
  }

  async function readJson(path, fallback) {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch {
      return fallback;
    }
  }

  function belongsToTenant(meta) {
    if (!tenantInfo) return true;
    return meta?.ownerId === tenantInfo.userId && meta?.projectId === tenantInfo.projectId;
  }

  async function createDocument(fileName, uploadExpectedSize = null) {
    await ensure();
    const id = randomUUID();
    const name = sanitizeFileName(fileName);
    await mkdir(docDir(id), { recursive: true });
    const now = Date.now();
    const meta = {
      id,
      fileName: name,
      size: 0,
      createdAt: now,
      updatedAt: now,
      ...(tenantInfo ? { ownerId: tenantInfo.userId, projectId: tenantInfo.projectId } : {}),
      ...(Number.isInteger(uploadExpectedSize) && uploadExpectedSize > 0 ? { uploadExpectedSize } : {}),
    };
    await writeJsonAtomic(metaPath(id), meta);
    return {
      ...meta,
      filePath: toServerFilePath(id, name),
      pdfPath: pdfPath(id),
      tempPath: uploadPath(id),
    };
  }

  async function getDocument(id) {
    const safeId = assertDocumentId(id);
    const meta = await readJson(metaPath(safeId), null);
    if (!meta || !belongsToTenant(meta)) return null;
    return {
      ...meta,
      filePath: toServerFilePath(safeId, meta.fileName),
      pdfPath: pdfPath(safeId),
      tempPath: uploadPath(safeId),
    };
  }

  async function requireDocument(id) {
    const record = await getDocument(id);
    if (!record) throw new Error("Document not found.");
    return record;
  }

  async function finalizeDocument(id, size) {
    const current = await requireDocument(id);
    const next = { ...current, size, updatedAt: Date.now() };
    delete next.filePath;
    delete next.pdfPath;
    delete next.tempPath;
    delete next.uploadExpectedSize;
    await writeJsonAtomic(metaPath(id), next);
    return getDocument(id);
  }

  async function removeDocument(id) {
    await requireDocument(id);
    await rm(docDir(id), { recursive: true, force: true });
  }

  async function getRecents() {
    const rows = await readJson(recentsPath, []);
    return Array.isArray(rows) ? rows : [];
  }

  async function pushRecent(filePath) {
    const current = await getRecents();
    const next = [
      { filePath, openedAt: Date.now() },
      ...current.filter((item) => item?.filePath !== filePath),
    ].slice(0, 30);
    await writeJsonAtomic(recentsPath, next);
    return next;
  }

  async function getSession() {
    return readJson(sessionPath, {
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
    await writeJsonAtomic(sessionPath, next);
    return next;
  }

  async function getAnnotations(id) {
    await requireDocument(id);
    const rows = await readJson(annotationsPath(assertDocumentId(id)), []);
    return Array.isArray(rows) ? rows : [];
  }

  async function putAnnotations(id, annotations) {
    await requireDocument(id);
    if (!Array.isArray(annotations)) throw new Error("annotations must be an array.");
    if (annotations.length > 10000) throw new Error("Too many annotations.");
    await writeJsonAtomic(annotationsPath(id), annotations);
    return annotations;
  }

  async function getDocumentSize(id) {
    await requireDocument(id);
    try {
      return (await stat(pdfPath(assertDocumentId(id)))).size;
    } catch {
      return null;
    }
  }

  async function getUploadSize(id) {
    await requireDocument(id);
    try {
      return (await stat(uploadPath(assertDocumentId(id)))).size;
    } catch {
      return null;
    }
  }

  async function getUsageBytes() {
    await ensure();
    const entries = await readdir(documentsRoot, { withFileTypes: true }).catch(() => []);
    let total = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || !UUID_RE.test(entry.name)) continue;
      const meta = await readJson(metaPath(entry.name), null);
      if (!meta || !belongsToTenant(meta)) continue;
      const reserved = Number(meta.uploadExpectedSize || 0);
      total += Math.max(Number(meta.size || 0), reserved);
    }
    return total;
  }

  async function getOwnerUsageBytes(ownerId) {
    const safeOwnerId = assertTenantId(ownerId, "user id");
    await ensure();
    const entries = await readdir(documentsRoot, { withFileTypes: true }).catch(() => []);
    let total = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || !UUID_RE.test(entry.name)) continue;
      const meta = await readJson(metaPath(entry.name), null);
      if (!meta || meta.ownerId !== safeOwnerId) continue;
      const reserved = Number(meta.uploadExpectedSize || 0);
      total += Math.max(Number(meta.size || 0), reserved);
    }
    return total;
  }

  return {
    root,
    stateRoot,
    tenant: tenantInfo,
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
    getUsageBytes,
    getOwnerUsageBytes,
  };
}
