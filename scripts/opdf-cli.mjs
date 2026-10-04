#!/usr/bin/env node
import { resolve } from "node:path";
import { parseArgs, resolveRuntimeOptions } from "./opdf-cli/args.mjs";
import { OpdfDriver } from "./opdf-cli/driver.mjs";
import { runAudit } from "./opdf-cli/audit.mjs";
import { printError, printResult } from "./opdf-cli/output.mjs";
import { listTools } from "./opdf-cli/tools.mjs";

const HELP = `
OPDF Automation CLI

Usage:
  opdf open [URL] [--json]
  opdf inspect [--url URL] [--pdf FILE] [--json]
  opdf document load FILE [--url URL] [--json]
  opdf page goto PAGE --pdf FILE [--url URL]
  opdf zoom set PERCENT --pdf FILE [--url URL]
  opdf menu open File|Edit|View|Tools [--pdf FILE]
  opdf tool list [--json]
  opdf tool open TOOL --pdf FILE [--url URL]
  opdf ai open --pdf FILE [--url URL]
  opdf ai ask "PROMPT" --pdf FILE [--url URL]
  opdf screenshot FILE [--pdf PDF] [--url URL]
  opdf console [--pdf FILE] [--wait MS] [--json]
  opdf audit smoke|full [--pdf FILE] [--url URL] [--out DIR] [--trace FILE]

Global options:
  --url URL       Target OPDF URL (default: OPDF_URL or http://127.0.0.1:8787)
  --pdf FILE      PDF to load before the command
  --json          Machine-readable JSON output
  --headed        Show Chromium
  --timeout MS    Playwright timeout (default: 30000)
  --wait MS       Wait after navigation (default: 700)
  --out DIR       Audit output directory (default: opdf-cli-artifacts)
  --trace FILE    Save Playwright trace
`.trim();

async function main() {
  const { positionals, options: rawOptions } = parseArgs(process.argv.slice(2));
  if (positionals[0] === "open" && positionals[1] && !rawOptions.url) {
    rawOptions.url = positionals[1];
  }
  const options = resolveRuntimeOptions(rawOptions);
  if (rawOptions.help || positionals.length === 0) {
    console.log(HELP);
    return;
  }

  const [command, action, value, ...rest] = positionals;

  if (command === "tool" && action === "list") {
    printResult({ ok: true, tools: listTools() }, options.json);
    return;
  }

  const driver = new OpdfDriver(options);

  try {
    await driver.start();

    if (options.pdf && !(command === "document" && action === "load")) {
      await driver.loadPdf(options.pdf);
    }

    let result;
    if (command === "open" || command === "inspect") {
      result = await driver.inspect();
    } else if (command === "document" && action === "load") {
      if (!value) throw new Error("document load requires a PDF path");
      result = await driver.loadPdf(value);
    } else if (command === "page" && action === "goto") {
      if (!value) throw new Error("page goto requires a page number");
      result = await driver.gotoPage(Number(value));
    } else if (command === "zoom" && action === "set") {
      if (!value) throw new Error("zoom set requires a percent");
      result = await driver.setZoom(Number(value));
    } else if (command === "menu" && action === "open") {
      if (!value) throw new Error("menu open requires a menu name");
      result = await driver.openMenu(value);
    } else if (command === "tool" && action === "open") {
      if (!value) throw new Error("tool open requires a tool name");
      result = await driver.openTool(value);
    } else if (command === "ai" && action === "open") {
      result = await driver.openAi();
    } else if (command === "ai" && action === "ask") {
      const prompt = [value, ...rest].filter(Boolean).join(" ");
      if (!prompt) throw new Error("ai ask requires a prompt");
      result = await driver.askAi(prompt);
    } else if (command === "screenshot") {
      const path = action || resolve(options.out, "screenshot.png");
      result = await driver.screenshot(path);
    } else if (command === "console") {
      await driver.page.waitForTimeout(options.wait);
      const state = await driver.inspect();
      result = { ok: state.errors.console.length === 0 && state.errors.network.length === 0, errors: state.errors };
    } else if (command === "audit" && (action === "smoke" || action === "full")) {
      result = await runAudit(driver, action, options);
    } else {
      throw new Error(`Unknown command: ${positionals.join(" ")}\n\n${HELP}`);
    }

    printResult(result, options.json);
    if (result?.ok === false) process.exitCode = 1;
  } catch (error) {
    printError(error, options.json);
    process.exitCode = 1;
  } finally {
    await driver.close();
  }
}

await main();
