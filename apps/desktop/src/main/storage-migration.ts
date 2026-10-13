import { constants } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

type MigrationResult = "migrated" | "already-present" | "no-legacy";

// Preserve the old state. Copy it once; never overwrite a newer destination.
export async function migrateDesktopStorage(homeDirectory: string): Promise<MigrationResult> {
  const previous = join(homeDirectory, ".opdf", "storage.json");
  const destinationDirectory = join(homeDirectory, ".tpdf");
  const current = join(destinationDirectory, "storage.json");

  try {
    await stat(current);
    return "already-present";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await stat(previous);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "no-legacy";
    throw error;
  }

  await mkdir(destinationDirectory, { recursive: true });
  try {
    await copyFile(previous, current, constants.COPYFILE_EXCL);
    return "migrated";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return "already-present";
    throw error;
  }
}
