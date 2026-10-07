import { resolve } from "node:path";
import { createBackup, restoreBackup, verifyBackup } from "../server/opdf-backup.mjs";

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};
  const positional = [];
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key === "force") {
      options.force = true;
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return { command, options, positional };
}

function defaultDataDir() {
  return resolve(process.env.OPDF_DATA_DIR || ".opdf-data");
}

function defaultBackupRoot(dataDir) {
  return resolve(process.env.OPDF_BACKUP_DIR || `${dataDir}-backups`);
}

function help() {
  console.log(`
OPDF backup CLI

Create:
  npm run backup:create -- --data-dir <dir> --backup-root <dir> --keep 7

Verify:
  npm run backup:verify -- --backup <backup-dir>

Restore:
  npm run backup:restore -- --backup <backup-dir> --target <data-dir> [--force]

The backup root must be outside OPDF_DATA_DIR. Restore verifies every file
with SHA-256 before replacing anything. --force preserves an existing target
as a timestamped pre-restore directory instead of deleting it.
`.trim());
}

const { command, options, positional } = parseArgs(process.argv.slice(2));

try {
  if (command === "create") {
    const dataDir = resolve(options["data-dir"] || defaultDataDir());
    const backupRoot = resolve(options["backup-root"] || defaultBackupRoot(dataDir));
    const result = await createBackup({
      dataDir,
      backupRoot,
      keep: Number(options.keep || 7),
      appVersion: process.env.OPDF_APP_VERSION || "unknown",
      commit: process.env.OPDF_BUILD_SHA || process.env.GITHUB_SHA || "unknown",
    });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "verify") {
    const backupDir = options.backup || positional[0];
    if (!backupDir) throw new Error("verify requires --backup <backup-dir>");
    const result = await verifyBackup(resolve(backupDir));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else if (command === "restore") {
    const backupDir = options.backup || positional[0];
    if (!backupDir) throw new Error("restore requires --backup <backup-dir>");
    const targetDir = resolve(options.target || defaultDataDir());
    const result = await restoreBackup({
      backupDir: resolve(backupDir),
      targetDir,
      force: options.force === true,
    });
    console.log(JSON.stringify(result, null, 2));
  } else {
    help();
    if (command !== "help" && command !== "--help" && command !== "-h") process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
