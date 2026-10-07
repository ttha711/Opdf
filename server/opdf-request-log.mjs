import { appendFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const LOG_FILE_PATTERN = /^opdf-(\d{4}-\d{2}-\d{2})\.jsonl$/;

function utcDay(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizeRetentionDays(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 14;
  return Math.max(1, Math.min(Math.trunc(number), 90));
}

export function createRequestLogger(logDir, options = {}) {
  const retentionDays = normalizeRetentionDays(options.retentionDays);
  let queue = Promise.resolve();
  let lastCleanupDay = "";

  async function cleanup(day) {
    if (lastCleanupDay === day) return;
    lastCleanupDay = day;
    const entries = await readdir(logDir, { withFileTypes: true }).catch(() => []);
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    await Promise.all(entries.map(async (entry) => {
      if (!entry.isFile()) return;
      const match = LOG_FILE_PATTERN.exec(entry.name);
      if (!match) return;
      const timestamp = Date.parse(`${match[1]}T00:00:00.000Z`);
      if (Number.isFinite(timestamp) && timestamp < cutoff) {
        await rm(join(logDir, entry.name), { force: true });
      }
    }));
  }

  async function write(record) {
    const timestamp = typeof record.timestamp === "string"
      ? record.timestamp
      : new Date().toISOString();
    const day = timestamp.slice(0, 10);
    await mkdir(logDir, { recursive: true });
    await cleanup(day);
    await appendFile(
      join(logDir, `opdf-${day}.jsonl`),
      JSON.stringify({ ...record, timestamp }) + "\n",
      "utf8",
    );
  }

  function log(record) {
    queue = queue
      .then(() => write(record))
      .catch((error) => {
        console.error("OPDF request log write failed:", error);
      });
  }

  async function flush() {
    await queue;
  }

  return {
    log,
    flush,
    logDir,
    retentionDays,
  };
}
