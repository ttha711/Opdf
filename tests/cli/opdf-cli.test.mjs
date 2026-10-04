import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, resolveRuntimeOptions } from "../../scripts/opdf-cli/args.mjs";
import { listTools, resolveTool } from "../../scripts/opdf-cli/tools.mjs";

test("parseArgs supports nested commands, booleans, and values", () => {
  const parsed = parseArgs([
    "audit",
    "full",
    "--url",
    "https://pdf.example.test",
    "--json",
    "--timeout=45000",
  ]);

  assert.deepEqual(parsed.positionals, ["audit", "full"]);
  assert.equal(parsed.options.url, "https://pdf.example.test");
  assert.equal(parsed.options.json, true);
  assert.equal(parsed.options.timeout, "45000");
});

test("runtime defaults are agent-friendly", () => {
  const runtime = resolveRuntimeOptions({ url: "https://pdf.example.test", timeout: "40000" });
  assert.equal(runtime.url, "https://pdf.example.test");
  assert.equal(runtime.timeout, 40000);
  assert.equal(runtime.json, false);
  assert.equal(runtime.out, "opdf-cli-artifacts");
});

test("tool aliases resolve stable OPDF workflows", () => {
  assert.equal(resolveTool("split").quick, "split-pdf");
  assert.equal(resolveTool("page-numbers").menu, "Page Numbers...");
  assert.equal(resolveTool("watermark").quick, "watermark-pdf");
  assert.ok(listTools().some((tool) => tool.name === "measure"));
});

test("unknown tools fail with discoverable supported aliases", () => {
  assert.throws(() => resolveTool("does-not-exist"), /Supported:/);
});
