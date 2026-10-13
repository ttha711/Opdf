import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDesktopStorage } from "./storage-migration.js";

async function main() {
  const home = await mkdtemp(join(tmpdir(), "tpdf-migration-"));
  try {
    assert.equal(await migrateDesktopStorage(home), "no-legacy");

    const previous = join(home, ".opdf");
    const destination = join(home, ".tpdf");
    const sample = JSON.stringify({
      recents: [{ filePath: "C:/Documents/example.pdf", openedAt: 1 }],
      session: { activeFilePath: null, openTabs: [], activeTabIndex: 0, updatedAt: 1 },
      annotationsByDocument: { document1: [] },
    });
    await mkdir(previous, { recursive: true });
    await writeFile(join(previous, "storage.json"), sample);

    assert.equal(await migrateDesktopStorage(home), "migrated");
    assert.equal(await readFile(join(destination, "storage.json"), "utf8"), sample);
    assert.equal(await readFile(join(previous, "storage.json"), "utf8"), sample);

    await writeFile(join(previous, "storage.json"), '{"recents":[]}');
    assert.equal(await migrateDesktopStorage(home), "already-present");
    assert.equal(await readFile(join(destination, "storage.json"), "utf8"), sample);
    console.log("TPDF desktop storage migration smoke passed.");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
