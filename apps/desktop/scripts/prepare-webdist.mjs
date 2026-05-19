import { mkdir, cp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(here, "..");
const src = resolve(desktopDir, "..", "web", "dist");
const dest = resolve(desktopDir, "web", "dist");

await mkdir(dest, { recursive: true });
await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true, force: true });
console.log(`Copied web dist: ${src} -> ${dest}`);
