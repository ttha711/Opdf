import { readFile, readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export const DEFAULT_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_OCR_TTL_MS = 24 * 60 * 60 * 1000;

function positiveMs(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function fileStat(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function latestActivityMs(dir, fallback = 0) {
  let latest = fallback;
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return latest;
    throw error;
  }
  for (const entry of entries) {
    const info = await fileStat(join(dir, entry.name));
    if (info) latest = Math.max(latest, info.mtimeMs || 0);
  }
  return latest;
}

export async function pruneStaleUploadsInDocumentsRoot(documentsRoot, options = {}) {
  const root = resolve(documentsRoot);
  const now = Number(options.now || Date.now());
  const maxAgeMs = positiveMs(options.maxAgeMs, DEFAULT_UPLOAD_TTL_MS);
  const cutoff = now - maxAgeMs;
  let uploadsRemoved = 0;
  let reservedBytesReleased = 0;

  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return { uploadsRemoved, reservedBytesReleased };
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    const meta = await readJson(join(dir, "meta.json"));
    const expected = Number(meta?.uploadExpectedSize || 0);
    if (!Number.isFinite(expected) || expected <= 0) continue;
    if (await fileStat(join(dir, "document.pdf"))) continue;

    const metaActivity = Math.max(
      Number(meta?.updatedAt || 0),
      Number(meta?.createdAt || 0),
    );
    const activity = await latestActivityMs(dir, metaActivity);
    if (activity >= cutoff) continue;

    await rm(dir, { recursive: true, force: true });
    uploadsRemoved += 1;
    reservedBytesReleased += expected;
  }

  return { uploadsRemoved, reservedBytesReleased };
}

export async function pruneExpiredOcrRoot(ocrRoot, options = {}) {
  const root = resolve(ocrRoot);
  const now = Number(options.now || Date.now());
  const maxAgeMs = positiveMs(options.maxAgeMs, DEFAULT_OCR_TTL_MS);
  const cutoff = now - maxAgeMs;
  let ocrArtifactsRemoved = 0;

  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return { ocrArtifactsRemoved };
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    const activity = await latestActivityMs(dir, (await fileStat(dir))?.mtimeMs || 0);
    if (activity >= cutoff) continue;
    await rm(dir, { recursive: true, force: true });
    ocrArtifactsRemoved += 1;
  }

  return { ocrArtifactsRemoved };
}

export async function pruneLocalDataTree(dataDir, options = {}) {
  const root = resolve(dataDir);
  const uploadOptions = { maxAgeMs: options.uploadMaxAgeMs, now: options.now };
  const ocrOptions = { maxAgeMs: options.ocrMaxAgeMs, now: options.now };
  const totals = {
    uploadsRemoved: 0,
    reservedBytesReleased: 0,
    ocrArtifactsRemoved: 0,
  };

  async function walk(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = join(dir, entry.name);
      if (entry.name === "documents") {
        const result = await pruneStaleUploadsInDocumentsRoot(child, uploadOptions);
        totals.uploadsRemoved += result.uploadsRemoved;
        totals.reservedBytesReleased += result.reservedBytesReleased;
        continue;
      }
      if (entry.name === "ocr") {
        const result = await pruneExpiredOcrRoot(child, ocrOptions);
        totals.ocrArtifactsRemoved += result.ocrArtifactsRemoved;
        continue;
      }
      await walk(child);
    }
  }

  await walk(root);
  return totals;
}
