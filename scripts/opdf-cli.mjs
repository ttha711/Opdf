#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs, resolveRuntimeOptions } from "./opdf-cli/args.mjs";
import { runAudit } from "./opdf-cli/audit.mjs";
import { OpdfDriver } from "./opdf-cli/driver.mjs";
import { listTools } from "./opdf-cli/tools.mjs";

const HELP = [
  "OPDF Automation CLI",
  "",
  "Usage:",
  "  opdf open [URL] [--json]",
  "  opdf inspect [--url URL] [--pdf FILE] [--json]",
  "  opdf document load <FILE> [--url URL] [--json]",
  "  opdf page goto <N> --pdf FILE [--url URL]",
  "  opdf zoom set <PERCENT> --pdf FILE [--url URL]",
  "  opdf menu open <File|Edit|View|Tools> [--pdf FILE]",
  "  opdf tool list [--json]",
  "  opdf tool open <NAME> --pdf FILE [--url URL]",
  "  opdf ai open [--pdf FILE]",
  "  opdf ai ask <TEXT> [--pdf FILE]",
  "  opdf screenshot <FILE> [--pdf FILE]",
  "  opdf console [--pdf FILE] [--json]",
  "  opdf audit <smoke|full|e2e> [--pdf FILE] [--url URL] [--out DIR] [--trace FILE] [--video-dir DIR] [--json]",
  "",
  "Global options:",
  "  --url URL          Target OPDF URL (default: OPDF_URL or http://127.0.0.1:8787)",
  "  --pdf FILE         Upload a PDF before running the command",
  "  --json             Print machine-readable JSON",
  "  --headed           Show Chromium instead of headless mode",
  "  --timeout MS       Browser/action timeout (default 30000)",
  "  --wait MS          Wait after initial navigation (default 700)",
  "  --out DIR          Artifact directory (default opdf-cli-artifacts)",
  "  --trace FILE       Save a Playwright trace",
  "  --video-dir DIR     Record Playwright video into DIR",
  "  --expected-sha SHA   Wait for deployed page to report this build commit",
  "  --deploy-timeout MS  Max wait for deployment fingerprint (default 600000)",
  "  --help             Show help",
  "",
  "Exit codes:",
  "  0 success",
  "  1 browser/product assertion failure",
  "  2 invalid CLI usage",
].join("\n");

function print(value, json = false) {
  if (json) {
    process.stdout.write(JSON.stringify(value, null, 2) + "\n");
    return;
  }
  if (typeof value === "string") {
    process.stdout.write(value + "\n");
    return;
  }
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

function usage(message, json) {
  if (message) print({ ok: false, kind: "usage", error: message }, json);
  if (!json) process.stderr.write((message ? "\n" : "") + HELP + "\n");
  process.exitCode = message ? 2 : 0;
}

function requireValue(value, message) {
  if (value === undefined || value === null || value === "") {
    const error = new Error(message);
    error.code = "USAGE";
    throw error;
  }
  return value;
}

const parsed = parseArgs(process.argv.slice(2));
const { positionals, options } = parsed;

if (options.help || positionals.length === 0 || positionals[0] === "help") {
  usage(null, false);
  process.exit();
}

const command = positionals[0];

if (command === "tool" && positionals[1] === "list") {
  print({ ok: true, tools: listTools() }, Boolean(options.json));
  process.exit();
}

if (command === "open" && positionals[1] && !options.url) {
  options.url = positionals[1];
}

let runtime;
try {
  runtime = resolveRuntimeOptions(options);
} catch (error) {
  usage(error instanceof Error ? error.message : String(error), Boolean(options.json));
  process.exit();
}

const driver = new OpdfDriver(runtime);
let started = false;

async function loadOptionalPdf(path = runtime.pdf) {
  if (path) await driver.loadPdf(path);
}

function requirePdf(path = runtime.pdf) {
  if (!path) {
    const error = new Error("This command requires --pdf FILE or document load <FILE>");
    error.code = "USAGE";
    throw error;
  }
  return path;
}

try {
  await driver.start();
  started = true;

  let result;

  if (command === "open") {
    result = await driver.inspect();
  } else if (command === "inspect") {
    await loadOptionalPdf();
    result = await driver.inspect();
  } else if (command === "document" && positionals[1] === "load") {
    const file = requireValue(positionals[2], "document load requires a PDF path");
    result = await driver.loadPdf(file);
  } else if (command === "page" && positionals[1] === "goto") {
    await driver.loadPdf(requirePdf());
    result = await driver.gotoPage(requireValue(positionals[2], "page goto requires a page number"));
  } else if (command === "zoom" && positionals[1] === "set") {
    await driver.loadPdf(requirePdf());
    result = await driver.setZoom(requireValue(positionals[2], "zoom set requires a percentage"));
  } else if (command === "menu" && positionals[1] === "open") {
    await loadOptionalPdf();
    result = await driver.openMenu(requireValue(positionals[2], "menu open requires a menu name"));
  } else if (command === "tool" && positionals[1] === "open") {
    await driver.loadPdf(requirePdf());
    result = await driver.openTool(requireValue(positionals[2], "tool open requires a tool name"));
  } else if (command === "ai" && positionals[1] === "open") {
    await loadOptionalPdf();
    result = await driver.openAi();
  } else if (command === "ai" && positionals[1] === "ask") {
    await loadOptionalPdf();
    const text = positionals.slice(2).join(" ").trim();
    result = await driver.askAi(requireValue(text, "ai ask requires text"));
  } else if (command === "screenshot") {
    await loadOptionalPdf();
    const target = requireValue(positionals[1], "screenshot requires an output file");
    result = await driver.screenshot(target);
  } else if (command === "console") {
    await loadOptionalPdf();
    await driver.page.waitForTimeout(runtime.wait);
    const state = await driver.inspect();
    result = {
      ok: state.errors.console.length === 0 && state.errors.page.length === 0 && state.errors.network.length === 0,
      errors: state.errors,
    };
  } else if (command === "audit") {
    const mode = positionals[1] || "smoke";
    if (!["smoke", "full", "e2e"].includes(mode)) {
      const error = new Error("audit mode must be smoke, full, or e2e");
      error.code = "USAGE";
      throw error;
    }
    result = await runAudit(driver, mode, runtime);
    await mkdir(resolve(runtime.out), { recursive: true });
    await writeFile(resolve(runtime.out, "report.json"), JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else {
    const error = new Error("Unknown command: " + positionals.join(" "));
    error.code = "USAGE";
    throw error;
  }

  print(result, runtime.json);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const isUsage = error && typeof error === "object" && error.code === "USAGE";
  print({ ok: false, kind: isUsage ? "usage" : "runtime", error: message }, runtime?.json);
  if (!runtime?.json && isUsage) process.stderr.write("\n" + HELP + "\n");
  process.exitCode = isUsage ? 2 : 1;
} finally {
  if (started) await driver.close().catch(() => {});
}
