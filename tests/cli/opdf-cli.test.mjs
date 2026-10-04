import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, resolveRuntimeOptions } from "../../scripts/opdf-cli/args.mjs";
import { listTools, resolveTool } from "../../scripts/opdf-cli/tools.mjs";
import { createSamplePdf } from "../../scripts/opdf-cli/sample.mjs";
import { inspectPdfFile } from "../../scripts/opdf-cli/pdf-checks.mjs";

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
  assert.equal(runtime.videoDir, null);
  assert.deepEqual(runtime.headers, {});
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


test("runtime accepts video artifact directory", () => {
  const runtime = resolveRuntimeOptions({ url: "https://pdf.example.test", "video-dir": "artifacts/video" });
  assert.equal(runtime.videoDir, "artifacts/video");
});

test("generated production e2e PDF is parseable and labeled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opdf-cli-test-"));
  try {
    const path = await createSamplePdf(dir, 3, {
      fileName: "labeled.pdf",
      title: "OPDF TEST",
      marker: "CLI-TEST",
    });
    const info = await inspectPdfFile(path);
    assert.equal(info.pageCount, 3);
    assert.ok(info.byteLength > 0);
    assert.match(info.sha256, /^[a-f0-9]{64}$/);
    if (info.text) {
      assert.match(info.text, /CLI-TEST-PAGE-1/);
      assert.match(info.text, /SECRET-CLI-TEST/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
