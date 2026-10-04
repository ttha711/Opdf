import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, resolveRuntimeOptions } from "../../scripts/opdf-cli/args.mjs";
import { resolveTool } from "../../scripts/opdf-cli/tools.mjs";

test("parseArgs separates positionals and options", () => {
  const result = parseArgs([
    "audit",
    "full",
    "--url",
    "https://pdf.example.test",
    "--pdf=sample.pdf",
    "--json",
    "--headed",
  ]);
  assert.deepEqual(result.positionals, ["audit", "full"]);
  assert.equal(result.options.url, "https://pdf.example.test");
  assert.equal(result.options.pdf, "sample.pdf");
  assert.equal(result.options.json, true);
  assert.equal(result.options.headed, true);
});

test("resolveRuntimeOptions applies safe defaults", () => {
  const result = resolveRuntimeOptions({ url: "https://pdf.example.test", timeout: "45000" });
  assert.equal(result.url, "https://pdf.example.test");
  assert.equal(result.timeout, 45000);
  assert.equal(result.wait, 700);
  assert.equal(result.out, "opdf-cli-artifacts");
});

test("resolveTool maps semantic aliases", () => {
  assert.equal(resolveTool("split").quick, "split-pdf");
  assert.equal(resolveTool("page-numbers").menu, "Page Numbers...");
  assert.equal(resolveTool("measure").menu, "Measure Drawing");
  assert.throws(() => resolveTool("does-not-exist"), /Unknown tool/);
});

test("invalid timeout is rejected before browser launch", () => {
  assert.throws(() => resolveRuntimeOptions({ timeout: "5" }), /at least 1000/);
});
