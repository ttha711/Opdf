import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBackup, restoreBackup, verifyBackup } from "./opdf-backup.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = await mkdtemp(join(tmpdir(), "opdf-backup-smoke-"));
const dataDir = join(root, "data");
const backupRoot = join(root, "backups");
const restoreDir = join(root, "restore");

try {
  await mkdir(join(dataDir, "documents", "doc-1"), { recursive: true });
  await writeFile(join(dataDir, "session.json"), JSON.stringify({ activeFilePath: "server://doc-1" }));
  await writeFile(join(dataDir, "documents", "doc-1", "document.pdf"), Buffer.from("%PDF-1.4\nbackup smoke"));
  await writeFile(join(dataDir, "documents", "doc-1", "annotations.json"), "[]");

  const created = await createBackup({
    dataDir,
    backupRoot,
    keep: 3,
    appVersion: "smoke",
    commit: "backup-smoke",
  });
  assert(created.files === 3, `expected 3 backed up files, got ${created.files}`);

  const verified = await verifyBackup(created.backupDir);
  assert(verified.ok, `backup verification failed: ${JSON.stringify(verified.failures)}`);

  const restored = await restoreBackup({
    backupDir: created.backupDir,
    targetDir: restoreDir,
  });
  assert(restored.files === 3, "restore file count mismatch");

  const session = JSON.parse(await readFile(join(restoreDir, "session.json"), "utf8"));
  assert(session.activeFilePath === "server://doc-1", "restored session mismatch");
  const pdf = await readFile(join(restoreDir, "documents", "doc-1", "document.pdf"), "utf8");
  assert(pdf.startsWith("%PDF-1.4"), "restored PDF mismatch");

  await writeFile(join(created.backupDir, "session.json"), "tampered");
  const tampered = await verifyBackup(created.backupDir);
  assert(!tampered.ok, "tampered backup must fail verification");

  console.log("OPDF backup smoke passed.");
} finally {
  await rm(root, { recursive: true, force: true });
}
