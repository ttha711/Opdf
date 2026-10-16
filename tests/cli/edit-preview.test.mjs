import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { stat } from "node:fs/promises";
import { createEditPreviewStore } from "../../server/tpdf-edit-previews.mjs";

const payload = () => Readable.from([Buffer.from("%PDF-1.7\npreview")]);

test("temporary edit previews enforce project scope and clean up on close", async () => {
  const store = createEditPreviewStore();
  const { id, expiresInMs } = await store.create(payload(), 1024, "tenant-a/project-a");
  const preview = store.get(id, "tenant-a/project-a");
  assert.ok(preview);
  assert.equal(expiresInMs, 600_000);
  assert.equal(store.get(id, "tenant-a/project-b"), null);
  assert.equal(store.get(id, "tenant-b/project-a"), null);
  assert.equal(store.get(id), null);
  assert.ok((await stat(preview.path)).isFile());
  store.close();
  assert.equal(store.get(id, "tenant-a/project-a"), null);
  await assert.rejects(() => store.create(payload(), 1024, "tenant-a/project-a"));
});

test("temporary edit previews reject oversized or non-PDF payloads", async () => {
  const store = createEditPreviewStore();
  try {
    await assert.rejects(() => store.create(payload(), 4, "tenant"), { statusCode: 413 });
    await assert.rejects(() => store.create(Readable.from([Buffer.from("invalid")]), 1024, "tenant"), { statusCode: 400 });
  } finally { store.close(); }
});

test("expired previews are deleted without another render request", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: Date.now() });
  const store = createEditPreviewStore({ TPDF_EDIT_PREVIEW_TTL_MS: "60000" });
  try {
    const { id } = await store.create(payload(), 1024, "tenant");
    const path = store.get(id, "tenant").path;
    t.mock.timers.tick(60_001);
    assert.equal(store.get(id, "tenant"), null);
    for (let attempt = 0; attempt < 20; attempt++) {
      if (!await stat(path).catch(() => null)) return;
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.fail("Expired preview file still exists");
  } finally { store.close(); }
});
