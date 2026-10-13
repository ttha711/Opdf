import test from "node:test";
import assert from "node:assert/strict";
import { parseRenderRequest, createRemoteRenderService } from "../../server/tpdf-remote-render.mjs";

const id = "123e4567-e89b-12d3-a456-426614174000";
const url = (path) => new URL("http://localhost/api/tpdf/documents/" + id + "/render/" + path);

test("metadata request stays document-scoped", () => {
  assert.deepEqual(parseRenderRequest(url("meta")), { id, kind: "meta" });
  assert.equal(parseRenderRequest(new URL("http://localhost/api/tpdf/health")), null);
});
test("tile request uses bounded levels and coordinates", () => {
  assert.deepEqual(parseRenderRequest(url("tile?page=0&level=2&x=1&y=3")),
    { id, kind: "tile", page: 0, level: 2, x: 1, y: 3 });
  for (const query of [
    "page=-1&level=2&x=0&y=0",
    "page=0&level=100&x=0&y=0",
    "page=0&level=2&x=999999999&y=0",
    "page=0&level=2&x=0&y=NaN",
    "page=0&level=2&x=0",
  ]) assert.throws(() => parseRenderRequest(url("tile?" + query)));
});
test("renderer off by default", () => {
  const service = createRemoteRenderService({});
  assert.equal(service.enabled, false);
  assert.equal(service.stats().cachedBytes, 0);
  service.close();
});
