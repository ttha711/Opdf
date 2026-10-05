import { createHash } from "node:crypto";

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function normalizeTenantId(value, fallback = "default") {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!normalized || normalized === "." || normalized === "..") return fallback;
  return normalized;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function parseTokenConfig(raw, defaultQuotaBytes) {
  if (!raw) return new Map();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OPDF_AUTH_TOKENS must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("OPDF_AUTH_TOKENS must be a JSON object keyed by bearer token.");
  }

  const result = new Map();
  for (const [token, config] of Object.entries(parsed)) {
    if (typeof token !== "string" || token.length < 12) {
      throw new Error("Each OPDF_AUTH_TOKENS token must be at least 12 characters.");
    }
    const row = config && typeof config === "object" ? config : {};
    const userId = normalizeTenantId(row.userId || row.email || row.name, "");
    if (!userId) throw new Error("Each OPDF_AUTH_TOKENS entry requires a userId.");
    result.set(token, {
      userId,
      displayName: String(row.displayName || row.email || userId).slice(0, 120),
      quotaBytes: positiveInteger(row.quotaBytes, defaultQuotaBytes),
      projects: Array.isArray(row.projects)
        ? row.projects.map((value) => normalizeTenantId(value)).filter(Boolean)
        : null,
    });
  }
  return result;
}

function userIdFromEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const local = normalizeTenantId(normalized.split("@")[0] || "user", "user").slice(0, 32);
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `${local}-${hash}`;
}

export function bearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string") return "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] || "";
}

export function cookieValue(req, name) {
  const raw = typeof req.headers.cookie === "string" ? req.headers.cookie : "";
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return "";
    }
  }
  return "";
}

function requestedProject(req, url) {
  const header = req.headers["x-opdf-project"];
  const raw = typeof header === "string"
    ? header
    : url.searchParams.get("project") || cookieValue(req, "opdf_project") || "default";
  return normalizeTenantId(raw);
}

export function createServerAuth(env = process.env) {
  const mode = String(env.OPDF_AUTH_MODE || "disabled").trim().toLowerCase();
  if (!["disabled", "token", "cloudflare"].includes(mode)) {
    throw new Error("OPDF_AUTH_MODE must be disabled, token, or cloudflare.");
  }

  const defaultQuotaBytes = positiveInteger(
    env.OPDF_DEFAULT_USER_QUOTA_BYTES,
    5 * 1024 * 1024 * 1024,
  );
  const tokenUsers = parseTokenConfig(env.OPDF_AUTH_TOKENS, defaultQuotaBytes);
  const allowedEmails = new Set(
    String(env.OPDF_CLOUDFLARE_ALLOWED_EMAILS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  if (mode === "token" && tokenUsers.size === 0) {
    throw new Error("OPDF_AUTH_MODE=token requires OPDF_AUTH_TOKENS.");
  }

  function authorizeProject(principal, projectId) {
    if (principal.projects && !principal.projects.includes(projectId)) {
      throw new AuthError(403, "This user is not authorized for the requested project.");
    }
    return { ...principal, projectId };
  }

  function authenticate(req, url) {
    const projectId = requestedProject(req, url);

    if (mode === "disabled") {
      return {
        mode,
        userId: "legacy",
        displayName: "Local user",
        quotaBytes: defaultQuotaBytes,
        projects: null,
        projectId,
        legacy: true,
      };
    }

    if (mode === "token") {
      const token = bearerToken(req) || cookieValue(req, "opdf_session");
      if (!token) throw new AuthError(401, "Bearer token or OPDF session cookie is required.");
      const principal = tokenUsers.get(token);
      if (!principal) throw new AuthError(401, "Bearer token is invalid.");
      return authorizeProject({ mode, ...principal, legacy: false }, projectId);
    }

    const emailHeader = req.headers["cf-access-authenticated-user-email"];
    const email = typeof emailHeader === "string" ? emailHeader.trim().toLowerCase() : "";
    if (!email) {
      throw new AuthError(401, "Cloudflare Access identity header is required.");
    }
    if (allowedEmails.size > 0 && !allowedEmails.has(email)) {
      throw new AuthError(403, "This Cloudflare Access user is not allowed.");
    }
    return {
      mode,
      userId: userIdFromEmail(email),
      displayName: email,
      email,
      quotaBytes: defaultQuotaBytes,
      projects: null,
      projectId,
      legacy: false,
    };
  }

  return {
    mode,
    enabled: mode !== "disabled",
    defaultQuotaBytes,
    authenticate,
  };
}
