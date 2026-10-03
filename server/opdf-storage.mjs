import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function toServerFilePath(id, fileName) {
  return `server://${assertDocumentId(id)}/${encodeURIComponent(sanitizeFileName(fileName))}`;
}

export function createOpdfStorage(rootDir) {
  const root = resolve(rootDir);
  const documentsRoot = join(root, "documents");
  const recentsPath = join(root, "recents.json");
  const sessionPath = join(root, "session.json");

  const docDir = (id) => join(documentsRoot, assertDocumentId(id));
  const pdfPath = (id) => join(docDir(id), "document.pdf");
  const metaPath = (id) => join(docDir(id), "meta.json");
  const annotationsPath = (id) => join(docDir(id), "annotations.json");

  async function ensure() {
    await mkdir(documentsRoot, { recursive: true });
  }

  async function writeJsonAtomic(path, value) {
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
    await rename(temp, path);
  }

  async function readJson(path, fallback) {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch {
      return fallback;
    }
  }

  async function createDocument(fileName) {
    await ensure();
    const id = randomUUID();
    const name = sanitizeFileName(fileName);
    const dir = docDir(id);
    await mkdir(dir, { recursive: true });
    const now = Date.now();
    const meta = { id, fileName: name, size: 0, createdAt: now, updatedAt: now };
    await writeJsonAtomic(metaPath(id), meta);
    return {
      ...meta,
      filePath: toServerFilePath(id, name),
      pdfPath: pdfPath(id),
      tempPath: join(dir, `upload-${randomUUID()}.tmp`),
    };
  }

  async function getDocument(id) {
    const safeId = assertDocumentId(id);
    const meta = await readJson(metaPath(safeId), null);
    if (!meta) return null;
    return {
      ...meta,
      filePath: toServerFilePath(safeId, meta.fileName),
      pdfPath: pdfPath(safeId),
    };
  }

  async function finalizeDocument(id, size) {
    const current = await getDocument(id);
    if (!current) throw new Error("Document not found.");
    const next = { ...current, size, updatedAt: Date.now() };
    delete next.filePath;
    delete next.pdfPath;
    await writeJsonAtomic(metaPath(id), next);
    return getDocument(id);
  }

  async function removeDocument(id) {
    await rm(docDir(id), { recursive: true, force: true });
  }

  async function getRecents() {
    const rows = await readJson(recentsPath, []);
    return Array.isArray(rows) ? rows : [];
  }

  async function pushRecent(filePath) {
    const current = await getRecents();
    const openedAt = Date.now();
    const next = [
      { filePath, openedAt },
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
      openTabs: Array.isArray(session?.openTabs) ? session.openTabs.filter((v) => typeof v === "string").slice(0, 50) : [],
      activeTabIndex: Number.isInteger(session?.activeTabIndex) ? session.activeTabIndex : 0,
      updatedAt: Date.now(),
    };
    await writeJsonAtomic(sessionPath, next);
    return next;
  }

  async function getAnnotations(id) {
    const rows = await readJson(annotationsPath(assertDocumentId(id)), []);
    return Array.isArray(rows) ? rows : [];
  }

  async function putAnnotations(id, annotations) {
    assertDocumentId(id);
    if (!Array.isArray(annotations)) throw new Error("annotations must be an array.");
    if (annotations.length > 10000) throw new Error("Too many annotations.");
    await writeJsonAtomic(annotationsPath(id), annotations);
    return annotations;
  }

  async function getDocumentSize(id) {
    try {
      return (await stat(pdfPath(assertDocumentId(id)))).size;
    } catch {
      return null;
    }
  }

  return {
    root,
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
  };
}
