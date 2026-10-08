import { randomUUID } from "node:crypto";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function clientAddress(req, trustProxy) {
  if (trustProxy) {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress || "unknown";
}

export function createLoginRateLimiter(env = process.env) {
  const trustProxy = env.OPDF_TRUST_PROXY === "1";
  const windowMs = Math.max(
    60_000,
    Math.min(Number(env.OPDF_LOGIN_RATE_WINDOW_MS || 15 * 60_000), 24 * 60 * 60_000),
  );
  const maxAttempts = Math.max(
    3,
    Math.min(Number(env.OPDF_LOGIN_RATE_MAX_ATTEMPTS || 10), 100),
  );
  const buckets = new Map();

  function keyFor(req, email) {
    return `${clientAddress(req, trustProxy)}:${String(email || "").trim().toLowerCase()}`;
  }

  function prune(now) {
    if (buckets.size < 2000) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  function assertAllowed(req, email) {
    const now = Date.now();
    prune(now);
    const key = keyFor(req, email);
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) return;
    if (bucket.attempts >= maxAttempts) {
      const error = httpError(429, "Too many sign-in attempts. Try again later.");
      error.retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      throw error;
    }
  }

  function recordFailure(req, email) {
    const now = Date.now();
    const key = keyFor(req, email);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { attempts: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.attempts += 1;
  }

  function clear(req, email) {
    buckets.delete(keyFor(req, email));
  }

  return { assertAllowed, recordFailure, clear, windowMs, maxAttempts };
}

export function assertSafeMutationRequest(req, env = process.env) {
  const method = String(req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "cross-site") {
    throw httpError(403, "Cross-site mutation request rejected.");
  }

  const origin = String(req.headers.origin || "").trim();
  if (!origin) return;
  if (origin === "null") throw httpError(403, "Untrusted request origin.");

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw httpError(403, "Invalid request origin.");
  }

  const configuredOrigin = String(env.OPDF_PUBLIC_ORIGIN || "").trim();
  if (configuredOrigin) {
    let expected;
    try {
      expected = new URL(configuredOrigin).origin;
    } catch {
      throw new Error("OPDF_PUBLIC_ORIGIN must be an absolute http(s) origin.");
    }
    if (parsed.origin !== expected) throw httpError(403, "Request origin is not allowed.");
    return;
  }

  const host = String(req.headers.host || "").toLowerCase();
  if (!host || parsed.host.toLowerCase() !== host) {
    throw httpError(403, "Request origin is not allowed.");
  }
}

export function applyProductionSecurityHeaders(res, env = process.env) {
  // Opt in only for Cloudflare Web Analytics; the trailing slash allows its\n  // unversioned beacon URL and versioned /beacon.min.js/<hash> path without unrelated scripts.
  const insightsScript = env.OPDF_CLOUDFLARE_INSIGHTS === "1"
    ? " https://static.cloudflareinsights.com/beacon.min.js https://static.cloudflareinsights.com/beacon.min.js/"
    : "";
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `script-src 'self' 'wasm-unsafe-eval'${insightsScript}`,
    "worker-src 'self' blob:",
    "connect-src 'self' https: wss: blob:",
    "frame-src 'self' https:",
    "media-src 'self' data: blob:",
    "manifest-src 'self'",
  ].join("; ");

  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  // The HTTPS public origin signals a TLS-terminated deployment; allow an
  // explicit OPDF_HSTS=0 opt-out for deployments that manage HSTS at the edge.
  let isHttpsDeployment = false;
  try {
    isHttpsDeployment = new URL(String(env.OPDF_PUBLIC_ORIGIN || "")).protocol === "https:";
  } catch {}
  if (env.OPDF_HSTS === "1" || (env.OPDF_HSTS !== "0" && isHttpsDeployment)) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

export function requestId(req) {
  const incoming = String(req.headers["x-request-id"] || "").trim();
  if (/^[A-Za-z0-9._:-]{1,128}$/.test(incoming)) return incoming;
  return randomUUID();
}
