import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createPageIndexApi } from "./tpdf-pageindex.mjs";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const OTHER = "123e4567-e89b-42d3-a456-426614174001";

test("PageIndex API scopes access and invalidates changed PDF", async () => {
  const original = process.env.TPDF_PAGEINDEX_ENABLED;
  process.env.TPDF_PAGEINDEX_ENABLED = "1";
  const root = await mkdtemp(join(tmpdir(), "tpdf-pageindex-"));
  try {
    const pdf = join(root, "document.pdf");
    await writeFile(pdf, "%PDF-1.7\nTest");
    const work = [];
    const storage = {
      async getDocument(id) { return id === ID ? { id, pdfPath: pdf } : null; },
      async ensureDocumentFile(id) { return id === ID; },
    };
    const service = createPageIndexApi({
      storage,
      tenantRuntime: { active: () => ({ tenantRoot: root }) },
      readJsonBody: async (req) => req.body,
      sendJson: (res, status, body) => { res.status = status; res.body = body; },
      sendError: (res, status, message) => { res.status = status; res.body = { error: message }; },
      worker: async (_, data) => {
        work.push(data);
        if (data.action === "index") return { ok: true, docId: "sdk-document-1" };
        if (data.action === "outline") return { ok: true, nodes: [{ title: "Chapter" }] };
        return { ok: true, answer: "Found on page 1", citations: [] };
      },
    });
    const request = async (method, path, body = {}) => {
      const res = {};
      await service.handle({ method, body }, res, new URL(path, "http://localhost"));
      return res;
    };
    const forbidden = await request("POST", "/api/tpdf/ai/index", { documentId: OTHER });
    assert.equal(forbidden.status, 404);
    const queued = await request("POST", "/api/tpdf/ai/index", { documentId: ID });
    assert.equal(queued.status, 202);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = await request("GET", "/api/tpdf/ai/index/" + ID);
      if (current.body.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const status = await request("GET", "/api/tpdf/ai/index/" + ID);
    assert.equal(status.body.status, "completed");
    const answer = await request("POST", "/api/tpdf/ai/ask", { documentId: ID, query: "Where?" });
    assert.equal(answer.status, 200);
    assert.match(answer.body.answer, /page 1/);
    assert.equal((await request("GET", "/api/tpdf/ai/outline/" + ID)).status, 200);
    assert.equal(work.filter((job) => job.action === "index").length, 1);
    assert.equal((await request("POST", "/api/tpdf/ai/index", { documentId: ID })).body.reused, true);
    await writeFile(pdf, "%PDF-1.7\nChanged!");
    const stale = await request("GET", "/api/tpdf/ai/index/" + ID);
    assert.equal(stale.body.status, "stale");
    const blocked = await request("POST", "/api/tpdf/ai/ask", { documentId: ID, query: "Where?" });
    assert.equal(blocked.status, 409);
  } finally {
    if (original === undefined) delete process.env.TPDF_PAGEINDEX_ENABLED;
    else process.env.TPDF_PAGEINDEX_ENABLED = original;
    await rm(root, { recursive: true, force: true });
  }
});
