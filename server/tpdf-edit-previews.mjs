import { mkdtemp, open, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export function createEditPreviewStore(env = process.env) {
  const ttl = Math.max(60_000, Math.min(3_600_000, Number(env.TPDF_EDIT_PREVIEW_TTL_MS) || 600_000));
  const previews = new Map();
  let closed = false;
  const remove = (preview) => rm(dirname(preview.path), { recursive: true, force: true });
  async function cleanup() {
    for (const [id, preview] of previews) {
      if (preview.expiresAt > Date.now()) continue;
      previews.delete(id);
      await remove(preview);
    }
  }
  const timer = setInterval(() => { void cleanup().catch(() => {}); }, Math.min(ttl, 60_000));
  timer.unref();

  async function create(req, limit, scope) {
    if (!scope || closed) throw Object.assign(new Error("Edit previews are unavailable."), { statusCode: 503 });
    const directory = await mkdtemp(join(tmpdir(), "tpdf-edit-preview-"));
    const path = join(directory, "preview.pdf");
    let handle;
    try {
      handle = await open(path, "wx");
      let total = 0;
      for await (const chunk of req) {
        total += chunk.length;
        if (total > limit) throw Object.assign(new Error("Preview PDF exceeds the configured operation limit."), { statusCode: 413 });
        await handle.writeFile(chunk);
      }
      await handle.close();
      handle = await open(path, "r");
      const signature = Buffer.alloc(5);
      await handle.read(signature, 0, 5, 0);
      if (total < 5 || signature.toString("ascii") !== "%PDF-") {
        throw Object.assign(new Error("Payload is not a PDF."), { statusCode: 400 });
      }
      if (closed) throw new Error("Renderer shutting down.");
      const id = randomUUID();
      previews.set(id, { path, scope, expiresAt: Date.now() + ttl });
      return { id, expiresInMs: ttl };
    } catch (error) {
      await handle?.close().catch(() => {});
      await remove({ path });
      throw error;
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  return {
    create,
    get(id, scope) {
      const preview = previews.get(id);
      if (!scope || preview?.scope !== scope || preview.expiresAt <= Date.now()) return null;
      preview.expiresAt = Date.now() + ttl;
      return preview;
    },
    close() {
      closed = true;
      clearInterval(timer);
      for (const preview of previews.values()) void remove(preview).catch(() => {});
      previews.clear();
    },
  };
}
