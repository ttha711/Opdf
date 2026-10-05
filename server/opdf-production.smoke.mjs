import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 22787;
const dataDir = await mkdtemp(join(tmpdir(), "opdf-production-smoke-"));
const base = `http://127.0.0.1:${port}`;
let child;
let stderr = "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForLive() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/opdf/live`);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`production smoke server did not start: ${stderr}`);
}

try {
  child = spawn(process.execPath, ["server/opdf-server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      OPDF_PORT: String(port),
      OPDF_DATA_DIR: dataDir,
      OPDF_WEB_DIST: join(process.cwd(), "apps", "web", "dist"),
      OPDF_AUTH_MODE: "local",
      OPDF_AUTH_SECRET: "opdf-production-smoke-secret-long-enough-2026",
      OPDF_BOOTSTRAP_EMAIL: "admin@production.test",
      OPDF_BOOTSTRAP_PASSWORD: "admin-production-2026",
      OPDF_LOGIN_RATE_MAX_ATTEMPTS: "3",
      OPDF_LOGIN_RATE_WINDOW_MS: "60000",
      OPDF_HSTS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  const live = await waitForLive();
  assert(live.headers.get("x-frame-options") === "DENY", "X-Frame-Options missing");
  assert(
    (live.headers.get("content-security-policy") || "").includes("frame-ancestors 'none'"),
    "frame-ancestors CSP missing",
  );
  assert(
    (live.headers.get("strict-transport-security") || "").includes("max-age="),
    "HSTS header missing when enabled",
  );
  assert(live.headers.get("x-request-id"), "request id header missing");

  const ready = await fetch(`${base}/api/opdf/ready`);
  assert(ready.status === 200, `readiness failed: ${ready.status}`);
  const readyPayload = await ready.json();
  assert(readyPayload.ok === true && readyPayload.status === "ready", "readiness payload is wrong");

  const anonymousProtected = await fetch(`${base}/api/opdf/auth/me`);
  assert(anonymousProtected.status === 401, "authenticated API is not protected");

  const crossSite = await fetch(`${base}/api/opdf/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://attacker.example",
      "Sec-Fetch-Site": "cross-site",
    },
    body: JSON.stringify({
      email: "admin@production.test",
      password: "admin-production-2026",
    }),
  });
  assert(crossSite.status === 403, `cross-site mutation was not rejected: ${crossSite.status}`);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${base}/api/opdf/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@production.test",
        password: "wrong-password-2026",
      }),
    });
    assert(response.status === 401, `failed login ${attempt + 1} returned ${response.status}`);
  }

  const throttled = await fetch(`${base}/api/opdf/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@production.test",
      password: "wrong-password-2026",
    }),
  });
  assert(throttled.status === 429, `login throttle did not return 429: ${throttled.status}`);
  assert(Number(throttled.headers.get("retry-after")) >= 1, "login throttle did not return Retry-After");

  const otherAccount = await fetch(`${base}/api/opdf/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "nobody@production.test",
      password: "wrong-password-2026",
    }),
  });
  assert(
    otherAccount.status === 401,
    "login throttling was not scoped to address + account",
  );

  console.log("OPDF production hardening smoke passed.");
} finally {
  if (child) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
  await rm(dataDir, { recursive: true, force: true });
}
