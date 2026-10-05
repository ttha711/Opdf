import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createOpdfStorage } from "./opdf-storage.mjs";
import { createOcrJobQueue } from "./opdf-ocr-queue.mjs";
import { createCertificateStore } from "./opdf-certificate-store.mjs";

const PROJECT_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

async function directorySize(root) {
  let total = 0;
  async function walk(path) {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) total += (await stat(full)).size;
    }
  }
  await walk(root);
  return total;
}

export function assertProjectId(value) {
  const id = String(value || "default").trim().toLowerCase();
  if (!PROJECT_RE.test(id)) throw new Error("Invalid project id.");
  return id;
}

export function createTenantRuntime(dataDir, options = {}) {
  const root = resolve(dataDir);
  const authEnabled = Boolean(options.authEnabled);
  const contexts = new Map();
  const scope = new AsyncLocalStorage();

  function makeContext(user, projectId, tenantRoot, userRoot) {
    return {
      user,
      projectId,
      tenantRoot,
      userRoot,
      storage: createOpdfStorage(tenantRoot),
      certificateStore: createCertificateStore(tenantRoot, options.certificateMasterKey || ""),
      ocrQueue: createOcrJobQueue(tenantRoot, { concurrency: options.ocrConcurrency || 1 }),
    };
  }

  const legacy = makeContext(
    { id: "local-single-user", quotaBytes: Number.MAX_SAFE_INTEGER },
    "default",
    root,
    root,
  );

  async function ensureContext(user, projectValue = "default") {
    if (!authEnabled) return legacy;
    const projectId = assertProjectId(projectValue);
    const key = `${user.id}:${projectId}`;
    let context = contexts.get(key);
    if (!context) {
      const userRoot = join(root, "users", user.id);
      const tenantRoot = join(userRoot, "projects", projectId);
      context = makeContext(user, projectId, tenantRoot, userRoot);
      contexts.set(key, context);
      await mkdir(tenantRoot, { recursive: true });
      await context.storage.ensure();
      await context.ocrQueue.ensure();
      await context.certificateStore.ensure();
    }
    return context;
  }

  function active() {
    return scope.getStore() || legacy;
  }

  function proxyFor(name) {
    return new Proxy({}, {
      get(_target, property) {
        if (property === "enabled" && name === "certificateStore") {
          return String(options.certificateMasterKey || "").length >= 16;
        }
        const service = active()[name];
        const value = service[property];
        return typeof value === "function" ? value.bind(service) : value;
      },
    });
  }

  async function quotaSnapshot(user = active().user) {
    if (!authEnabled) {
      return {
        usedBytes: 0,
        quotaBytes: Number.MAX_SAFE_INTEGER,
        availableBytes: Number.MAX_SAFE_INTEGER,
        percentUsed: 0,
      };
    }
    const userRoot = join(root, "users", user.id);
    const usedBytes = await directorySize(userRoot);
    const quotaBytes = Math.max(0, Number(user.quotaBytes || 0));
    return {
      usedBytes,
      quotaBytes,
      availableBytes: Math.max(0, quotaBytes - usedBytes),
      percentUsed: quotaBytes > 0
        ? Math.min(100, Math.round((usedBytes / quotaBytes) * 10000) / 100)
        : 0,
    };
  }

  async function assertCanAdd(bytes, replacingBytes = 0, user = active().user) {
    if (!authEnabled) return;
    const requested = Math.max(0, Number(bytes || 0) - Math.max(0, Number(replacingBytes || 0)));
    const snapshot = await quotaSnapshot(user);
    if (requested > snapshot.availableBytes) {
      const error = new Error("Storage quota exceeded.");
      error.code = "OPDF_QUOTA_EXCEEDED";
      error.statusCode = 413;
      throw error;
    }
  }

  return {
    authEnabled,
    storage: proxyFor("storage"),
    certificateStore: proxyFor("certificateStore"),
    ocrQueue: proxyFor("ocrQueue"),
    async ensure() {
      if (!authEnabled) {
        await legacy.storage.ensure();
        await legacy.ocrQueue.ensure();
        await legacy.certificateStore.ensure();
      } else {
        await mkdir(join(root, "users"), { recursive: true });
      }
    },
    projectFromRequest(req, url) {
      return assertProjectId(req.headers["x-opdf-project"] || url.searchParams.get("project") || "default");
    },
    async run(user, projectId, callback) {
      const context = await ensureContext(user, projectId);
      return scope.run(context, callback);
    },
    active,
    quotaSnapshot,
    assertCanAdd,
    async listProjects(user) {
      if (!authEnabled) return [{ id: "default" }];
      const projectsRoot = join(root, "users", user.id, "projects");
      await mkdir(projectsRoot, { recursive: true });
      const entries = await readdir(projectsRoot, { withFileTypes: true });
      const rows = entries
        .filter((entry) => entry.isDirectory() && PROJECT_RE.test(entry.name))
        .map((entry) => ({ id: entry.name }))
        .sort((a, b) => a.id.localeCompare(b.id));
      if (!rows.some((row) => row.id === "default")) {
        await ensureContext(user, "default");
        rows.unshift({ id: "default" });
      }
      return rows;
    },
    async createProject(user, projectValue) {
      const projectId = assertProjectId(projectValue);
      await ensureContext(user, projectId);
      return { id: projectId };
    },
  };
}
