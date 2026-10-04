import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = "apps/web/src";
const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".html"]);
const vietnamesePattern = /[ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠ-ỹ]/u;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (codeExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const violations = [];
for (const file of await walk(root)) {
  const content = await readFile(file, "utf8");
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (vietnamesePattern.test(lines[index])) {
      violations.push({
        file: relative(".", file).replaceAll("\\", "/"),
        line: index + 1,
        text: lines[index].trim(),
      });
    }
  }
}

if (violations.length) {
  console.error("\nEnglish-only UI check failed. Vietnamese text was found in web source:\n");
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line}: ${violation.text}`);
  }
  console.error(`\nFound ${violations.length} violation(s). All user-facing web UI source must use English.\n`);
  process.exit(1);
}

console.log("English-only UI check passed: no Vietnamese text found in apps/web/src.");
