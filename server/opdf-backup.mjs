import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const MANIFEST_NAME = ".opdf-backup-manifest.json";

function timestampName(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function isWithin(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep));
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  let size = 0;
  await new Promise((resolveHash, rejectHash) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => {
      size += chunk.length;
      hash.update(chunk);
    });
    stream.on("end", resolveHash);
    stream.on("error", rejectHash);
  });
  return { size, sha256: hash.digest("hex") };
}

async function collectFiles(root, current = root) {
  const rows = [];
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = join(current, entry.name);
    const rel = relative(root, absolute).replaceAll("\\", "/");
    if (rel === MANIFEST_NAME) continue;
    if (entry.isSymbolicLink()) {
      throw new Error(`Backup source contains unsupported symbolic link: ${rel}`);
    }
    if (entry.isDirectory()) {
      rows.push(...await collectFiles(root, absolute));
    } else if (entry.isFile()) {
      rows.push({ absolute, relative: rel });
    }
  }
  return rows.sort((a, b) => a.relative.localeCompare(b.relative));
}

async function copyTreeWithManifest(source, destination) {
  const files = await collectFiles(source);
  const manifestFiles = [];
  for (const file of files) {
    const output = join(destination, file.relative);
    await mkdir(dirname(output), { recursive: true });
    await copyFile(file.absolute, output);
    const digest = await hashFile(output);
    manifestFiles.push({
      path: file.relative,
      size: digest.size,
      sha256: digest.sha256,
    });
  }
  return manifestFiles;
}

async function readManifest(backupDir) {
  const raw = await readFile(join(backupDir, MANIFEST_NAME), "utf8");
  const manifest = JSON.parse(raw);
  if (
    manifest?.format !== 1 ||
    !Array.isArray(manifest.files) ||
    typeof manifest.createdAt !== "string"
  ) {
    throw new Error("Invalid OPDF backup manifest.");
  }
  return manifest;
}

async function pruneBackups(backupRoot, keep) {
  const limit = Math.max(1, Math.min(Number(keep) || 7, 365));
  const entries = await readdir(backupRoot, { withFileTypes: true }).catch(() => []);
  const backups = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("opdf-backup-"))
    .sort((a, b) => b.name.localeCompare(a.name));
  await Promise.all(backups.slice(limit).map((entry) =>
    rm(join(backupRoot, entry.name), { recursive: true, force: true })
  ));
}

export async function createBackup({
  dataDir,
  backupRoot,
  keep = 7,
  appVersion = "unknown",
  commit = "unknown",
}) {
  const source = resolve(dataDir);
  const root = resolve(backupRoot);
  const info = await stat(source).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`OPDF data directory not found: ${source}`);
  if (isWithin(source, root)) {
    throw new Error("Backup root must be outside OPDF_DATA_DIR.");
  }

  await mkdir(root, { recursive: true });
  const stamp = timestampName();
  const finalDir = join(root, `opdf-backup-${stamp}`);
  const tempDir = join(root, `.opdf-backup-${stamp}.partial-${process.pid}`);
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });

  try {
    const files = await copyTreeWithManifest(source, tempDir);
    const manifest = {
      format: 1,
      createdAt: new Date().toISOString(),
      source: source,
      appVersion,
      commit,
      files,
    };
    await writeFile(join(tempDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + "\n", "utf8");
    await rename(tempDir, finalDir);
    await pruneBackups(root, keep);
    return { backupDir: finalDir, files: files.length, manifest };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function verifyBackup(backupDir) {
  const root = resolve(backupDir);
  const manifest = await readManifest(root);
  const failures = [];

  for (const expected of manifest.files) {
    if (
      typeof expected.path !== "string" ||
      expected.path.startsWith("/") ||
      expected.path.includes("../") ||
      expected.path.includes("..\\")
    ) {
      failures.push({ path: String(expected.path), reason: "unsafe manifest path" });
      continue;
    }
    const filePath = resolve(root, expected.path);
    if (!isWithin(root, filePath)) {
      failures.push({ path: expected.path, reason: "path escapes backup root" });
      continue;
    }
    const info = await lstat(filePath).catch(() => null);
    if (!info?.isFile() || info.isSymbolicLink()) {
      failures.push({ path: expected.path, reason: "file missing or unsafe" });
      continue;
    }
    const actual = await hashFile(filePath);
    if (actual.size !== expected.size || actual.sha256 !== expected.sha256) {
      failures.push({ path: expected.path, reason: "size or SHA-256 mismatch" });
    }
  }

  const actualFiles = (await collectFiles(root)).map((entry) => entry.relative);
  const expectedSet = new Set(manifest.files.map((entry) => entry.path));
  for (const file of actualFiles) {
    if (!expectedSet.has(file)) failures.push({ path: file, reason: "unexpected file" });
  }

  return {
    ok: failures.length === 0,
    backupDir: root,
    files: manifest.files.length,
    createdAt: manifest.createdAt,
    failures,
    manifest,
  };
}

export async function restoreBackup({ backupDir, targetDir, force = false }) {
  const verified = await verifyBackup(backupDir);
  if (!verified.ok) {
    throw new Error(`Backup verification failed: ${JSON.stringify(verified.failures)}`);
  }

  const source = resolve(backupDir);
  const target = resolve(targetDir);
  if (isWithin(source, target) || isWithin(target, source)) {
    throw new Error("Backup and restore target must not be nested inside each other.");
  }

  const existing = await stat(target).catch(() => null);
  if (existing && !force) {
    throw new Error("Restore target already exists. Pass --force to preserve it as a pre-restore copy.");
  }

  await mkdir(dirname(target), { recursive: true });
  const tempTarget = `${target}.restore-partial-${process.pid}`;
  await rm(tempTarget, { recursive: true, force: true });
  await mkdir(tempTarget, { recursive: true });
  await copyTreeWithManifest(source, tempTarget);
  await rm(join(tempTarget, MANIFEST_NAME), { force: true }).catch(() => {});

  let previousPath = null;
  if (existing) {
    previousPath = `${target}.pre-restore-${timestampName()}`;
    await rename(target, previousPath);
  }

  try {
    await rename(tempTarget, target);
  } catch (error) {
    if (previousPath) await rename(previousPath, target).catch(() => {});
    await rm(tempTarget, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  return {
    restoredTo: target,
    previousPath,
    files: verified.files,
    backup: basename(source),
  };
}
