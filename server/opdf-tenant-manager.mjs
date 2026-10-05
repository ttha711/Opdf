import { mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { AuthError, normalizeTenantId } from "./opdf-auth.mjs";
import { createCertificateStore } from "./opdf-certificate-store.mjs";
import { createOcrJobQueue } from "./opdf-ocr-queue.mjs";
import { createOpdfStorage } from "./opdf-storage.mjs";

export class QuotaError extends Error {
  constructor(message) {
    super(message);
    this.name = "QuotaError";
    this.status = 413;
  }
}

export function createTenantManager({
  dataDir,
  auth,
  certificateMasterKey = "",
  ocrConcurrency = 1,
}) {
  const root = resolve(dataDir);
  const storages = new Map();
  const certificateStores = new Map();
  const ocrQueues = new Map();

  const tenantKey = (context) =>
    context.legacy ? "legacy" : `${context.userId}:${context.projectId}`;

  const userRoot = (context) =>
    context.legacy ? root : join(root, "tenants", context.userId);

  const projectRoot = (context) =>
    context.legacy
      ? root
      : join(userRoot(context), "projects", context.projectId);

  async function resolveContext(req, url) {
    if (req.__opdfTenantContext) return req.__opdfTenantContext;
    const context = auth.authenticate(req, url);
    req.__opdfTenantContext = context;
    return context;
  }

  async function storage(context) {
    const key = tenantKey(context);
    if (!storages.has(key)) {
      const value = createOpdfStorage(root, context);
      await value.ensure();
      storages.set(key, value);
    }
    return storages.get(key);
  }

  async function certificateStore(context) {
    const key = context.legacy ? "legacy" : context.userId;
    if (!certificateStores.has(key)) {
      const value = createCertificateStore(userRoot(context), certificateMasterKey);
      await value.ensure();
      certificateStores.set(key, value);
    }
    return certificateStores.get(key);
  }

  async function ocrQueue(context) {
    const key = tenantKey(context);
    if (!ocrQueues.has(key)) {
      const value = createOcrJobQueue(projectRoot(context), {
        concurrency: ocrConcurrency,
      });
      await value.ensure();
      ocrQueues.set(key, value);
    }
    return ocrQueues.get(key);
  }

  async function usage(context) {
    const activeStorage = await storage(context);
    return context.legacy
      ? activeStorage.getUsageBytes()
      : activeStorage.getOwnerUsageBytes(context.userId);
  }

  async function assertQuota(context, incomingBytes, replacingBytes = 0) {
    if (context.legacy) return;
    const incoming = Math.max(0, Number(incomingBytes) || 0);
    const replacing = Math.max(0, Number(replacingBytes) || 0);
    const used = await usage(context);
    const next = Math.max(0, used - replacing) + incoming;
    if (next > context.quotaBytes) {
      throw new QuotaError(
        `Storage quota exceeded: ${next} bytes requested with a ${context.quotaBytes} byte quota.`,
      );
    }
  }

  async function listProjects(context) {
    if (context.legacy) return [{ id: "default", active: true }];
    const projectsRoot = join(userRoot(context), "projects");
    await mkdir(projectsRoot, { recursive: true });
    const entries = await readdir(projectsRoot, { withFileTypes: true }).catch(() => []);
    const ids = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => normalizeTenantId(entry.name))
      .filter(Boolean);
    if (!ids.includes(context.projectId)) ids.push(context.projectId);
    return [...new Set(ids)].sort().map((id) => ({
      id,
      active: id === context.projectId,
    }));
  }

  async function createProject(context, requestedId) {
    if (context.legacy) return { id: "default", active: true };
    const id = normalizeTenantId(requestedId, "");
    if (!id) throw new AuthError(400, "A valid project id is required.");
    if (context.projects && !context.projects.includes(id)) {
      throw new AuthError(403, "This user is not authorized to create that project.");
    }
    await mkdir(join(userRoot(context), "projects", id), { recursive: true });
    return { id, active: id === context.projectId };
  }

  return {
    authMode: auth.mode,
    authEnabled: auth.enabled,
    certificateStorageEnabled: certificateMasterKey.length >= 16,
    resolveContext,
    storage,
    certificateStore,
    ocrQueue,
    usage,
    assertQuota,
    listProjects,
    createProject,
    userRoot,
    projectRoot,
  };
}
