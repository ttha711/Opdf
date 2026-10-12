#!/usr/bin/env node
// One-time whole-repository branding migration. Run from the repository root.
// Intentionally leaves binary files untouched and keeps git history intact.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, existsSync } from "node:fs";
import { dirname } from "node:path";
const names = execFileSync("git", ["ls-files", "-z"]).toString("utf8").split("\0").filter(Boolean);
const replace = (s) => s.replace(/OPDF|Opdf|opdf/g, (m) => ({OPDF:"TPDF",Opdf:"Tpdf",opdf:"tpdf"})[m]);
let contents = 0, renamed = 0, skippedBinary = 0;
const moves = [];
for (const path of names) {
  const buf = readFileSync(path);
  if (buf.includes(0) || /\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz)$/i.test(path)) {
    skippedBinary++;
  } else {
    const oldText = buf.toString("utf8");
    const newText = replace(oldText);
    if (newText !== oldText) { writeFileSync(path, newText); contents++; }
  }
  const target = replace(path);
  if (path !== target) moves.push({path, target});
}
// Rename deepest source paths first; all target directories are created in advance.
for (const {path, target} of moves) {
  mkdirSync(dirname(target), {recursive:true});
  if (existsSync(target) && target !== path) throw new Error("Rename collision: " + target);
  renameSync(path, target);
  renamed++;
}
console.log(JSON.stringify({files:names.length,contents,renamed,skippedBinary},null,2));
