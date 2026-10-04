import ts from "typescript";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = "apps/web/src";
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const rawExtensions = new Set([".css", ".html"]);
const vietnamesePattern = /[ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠ-ỹ]/u;

// These files intentionally contain Vietnamese aliases used only to understand
// multilingual user commands. They are not UI copy.
const multilingualInternalFiles = new Set([
  "apps/web/src/components/AiAssistantPanel.utils.ts",
  "apps/web/src/components/AiAssistantPanel.hooks.ts",
  "apps/web/src/components/live-editor/aiPatchService.ts",
  "apps/web/src/hooks/opdf-bridge/mockBridge.ts",
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (sourceExtensions.has(extname(entry.name)) || rawExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function collectSourceViolations(file, content) {
  const rel = relative(".", file).replaceAll("\\", "/");
  if (multilingualInternalFiles.has(rel)) return [];

  const kind = extname(file) === ".tsx" ? ts.ScriptKind.TSX
    : extname(file) === ".jsx" ? ts.ScriptKind.JSX
    : extname(file) === ".js" || extname(file) === ".mjs" || extname(file) === ".cjs" ? ts.ScriptKind.JS
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, kind);
  const hits = [];

  const record = (node, value) => {
    if (!value || !vietnamesePattern.test(value)) return;
    hits.push({
      file: rel,
      line: lineOf(sourceFile, node),
      text: value.replace(/\s+/g, " ").trim().slice(0, 240),
    });
  };

  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
      record(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      record(node.head, node.head.text);
      for (const span of node.templateSpans) record(span.literal, span.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hits;
}

const violations = [];
for (const file of await walk(root)) {
  const content = await readFile(file, "utf8");
  const ext = extname(file);
  if (rawExtensions.has(ext)) {
    const rel = relative(".", file).replaceAll("\\", "/");
    content.split(/\r?\n/).forEach((line, index) => {
      if (vietnamesePattern.test(line)) violations.push({ file: rel, line: index + 1, text: line.trim() });
    });
  } else {
    violations.push(...collectSourceViolations(file, content));
  }
}

if (violations.length) {
  console.error("\nEnglish-only UI check failed. Vietnamese user-facing text was found:\n");
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line}: ${violation.text}`);
  }
  console.error(`\nFound ${violations.length} violation(s). UI copy must be English. Multilingual NLP aliases remain allowed in explicitly internal parser files.\n`);
  process.exit(1);
}

console.log("English-only UI check passed. User-facing web copy is English; multilingual NLP aliases are allowed only in internal parser files.");
