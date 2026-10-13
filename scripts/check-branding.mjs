import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Historical identifiers are intentionally present only in upgrade helpers.
const exceptions = new Set([
  "apps/desktop/src/main/storage-migration.ts",
  "apps/desktop/src/main/storage-migration.smoke.ts",
  "apps/web/public/tpdf-sw.js",
  "docs/TPDF_UPGRADE.md",
]);
const obsolete = ["OP" + "DF", "Op" + "df", "op" + "df"];
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0").filter(Boolean);
const binary = /\.(?:jpe?g|png|webp|ico|gif|woff2?|ttf|otf|pdf|zip|gz)$/i;
const issues = [];
for (const path of tracked) {
  if (exceptions.has(path)) continue;
  if (obsolete.some((word) => path.includes(word))) issues.push(path + ": filename");
  if (binary.test(path)) continue;
  const bytes = readFileSync(path);
  if (bytes.includes(0)) continue;
  const lines = bytes.toString("utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (obsolete.some((word) => line.includes(word))) issues.push(path + ":" + (index + 1));
  });
}
if (issues.length) {
  console.error("Obsolete brand references found:\n" + issues.join("\n"));
  process.exitCode = 1;
} else {
  console.log("TPDF branding check passed. Legacy strings remain only in upgrade compatibility code.");
}
