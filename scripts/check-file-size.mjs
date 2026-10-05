import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_LINES = 300;
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|mjs)$/i;
const ALLOW_MARKER = /opdf-file-size-allow:\s*(.+)/i;
const base = process.argv[2] || "origin/main";

function changedFiles() {
  try {
    return execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`], {
      encoding: "utf8",
    }).trim().split("\n").filter(Boolean);
  } catch {
    return execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", "HEAD^", "HEAD"], {
      encoding: "utf8",
    }).trim().split("\n").filter(Boolean);
  }
}

const failures = [];
for (const file of changedFiles().filter((name) => SOURCE_EXTENSIONS.test(name))) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lineCount = content.split(/\r?\n/).length;
  if (lineCount <= MAX_LINES) continue;

  const marker = content.split(/\r?\n/).slice(0, 8).join("\n").match(ALLOW_MARKER);
  if (marker?.[1]?.trim()) {
    console.log(`ALLOW ${file}: ${lineCount} lines — ${marker[1].trim()}`);
    continue;
  }
  failures.push({ file, lineCount });
}

if (failures.length) {
  console.error(`Source files must stay at or below ${MAX_LINES} lines unless an explicit reason is documented.`);
  for (const { file, lineCount } of failures) console.error(`- ${file}: ${lineCount} lines`);
  process.exit(1);
}

console.log(`File-size gate passed (max ${MAX_LINES} lines for changed source files).`);
