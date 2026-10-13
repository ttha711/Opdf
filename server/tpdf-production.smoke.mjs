import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./tpdf-security-headers.smoke.mjs";

const port = 22787;
const dataDir = await mkdtemp(join(tmpdir(), "tpdf-production-smoke-"));
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
      const response = await fetch(`${base}/api/tpdf/live`);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`production smoke server did not start: ${stderr}`);
}

try {
  child = spawn(process.execPath, ["server/tpdf-server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TPDF_PORT: String(port),
      TPDF_DATA_DIR: dataDir,
      TPDF_WEB_DIST: join(process.cwd(), "apps", "web", "dist"),
      TPDF_AUTH_MODE: "local",
      TPDF_AUTH_SECRET: "tpdf-production-smoke-secret-long-enough-2026",
      TPDF_BOOTSTRAP_EMAIL: "admin@production.test",
      TPDF_BOOTSTRAP_PASSWORD: "admin-production-2026",
      TPDF_LOGIN_RATE_MAX_ATTEMPTS: "3",
      TPDF_LOGIN_RATE_WINDOW_MS: "60000",
      TPDF_PUBLIC_ORIGIN: "https://pdf.example.com",
      TPDF_HSTS: "",
      TPDF_CLOUDFLARE_INSIGHTS: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  const live = await waitForLive();
  assert(live.headers.get("x-frame-options") === "DENY", "X-Frame-Options missing");
  const csp = live.headers.get("content-security-policy") || "";
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    "connect-src 'self' https: wss: blob:",
  ]) {
    assert(csp.includes(directive), `CSP directive missing: ${directive}`);
  }
  assert(
    (live.headers.get("strict-transport-security") || "").includes("max-age="),
    "HSTS header missing for an HTTPS public origin",
  );
  assert(live.headers.get("x-request-id"), "request id header missing");

  const web = await fetch(`${base}/`);
  assert(web.status === 200, `web shell failed: ${web.status}`);
  const webHtml = await web.text();
  assert(webHtml.includes('<meta name="tpdf-runtime" content="server">'),
    "runtime mode metadata missing");
  assert(webHtml.includes('<meta name="tpdf-server-base" content="/api/tpdf">'),
    "server API base metadata missing");
  assert(!webHtml.includes('src="/tpdf-runtime.js"'), "external runtime script must not block parsing");
  assert(!webHtml.includes('window.__TPDF_RUNTIME__="server"'), "runtime config must not be inline");

  const runtimeConfig = await fetch(`${base}/tpdf-runtime.js`);
  assert(runtimeConfig.status === 200, "runtime config endpoint failed");
  assert(
    (runtimeConfig.headers.get("content-type") || "").includes("text/javascript"),
    "runtime config has wrong content type",
  );
  assert((await runtimeConfig.text()).includes('__TPDF_RUNTIME__="server"'), "runtime config payload missing");

  const traversal = await fetch(`${base}/%2e%2e%2fpackage.json`);
  assert(traversal.status === 403, `static path traversal was not rejected: ${traversal.status}`);

  const ready = await fetch(`${base}/api/tpdf/ready`);
  assert(ready.status === 200, `readiness failed: ${ready.status}`);
  const readyPayload = await ready.json();
  assert(readyPayload.ok === true && readyPayload.status === "ready", "readiness payload is wrong");

  const anonymousProtected = await fetch(`${base}/api/tpdf/auth/me`);
  assert(anonymousProtected.status === 401, "authenticated API is not protected");

  const login = await fetch(`${base}/api/tpdf/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@production.test",
      password: "admin-production-2026",
    }),
  });
  assert(login.status === 200, `valid login failed: ${login.status}`);
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  assert(cookie, "valid login did not return a session cookie");

  const pairingStart = await fetch(`${base}/api/tpdf/agent/pairing/start`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: "{}",
  });
  assert(pairingStart.status === 201, `agent pairing start failed: ${pairingStart.status}`);
  const pairing = await pairingStart.json();
  assert(typeof pairing.code === "string" && pairing.code.length >= 8, "pairing code missing");

  const pairingClaim = await fetch(`${base}/api/tpdf/agent/pairing/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: pairing.code,
      machine: { machineId: "production-smoke-machine", name: "Smoke Machine Agent", version: "1" },
    }),
  });
  assert(pairingClaim.status === 200, `agent pairing claim failed: ${pairingClaim.status}`);
  const claimed = await pairingClaim.json();
  assert(typeof claimed.token === "string" && claimed.token.length > 32, "machine agent token missing");

  const agentStatus = await fetch(`${base}/api/tpdf/agent/status`, {
    headers: { Cookie: cookie },
  });
  assert(agentStatus.status === 200, `agent status failed: ${agentStatus.status}`);
  const statusPayload = await agentStatus.json();
  assert(statusPayload.agents?.length === 1, "paired machine agent is not visible to web session");

  const chat = await fetch(`${base}/api/tpdf/agent/chat`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "Summarize page one", context: { currentPage: 1 } }),
  });
  assert(chat.status === 202, `agent task creation failed: ${chat.status}`);
  const chatTask = await chat.json();

  const nextTask = await fetch(`${base}/api/tpdf/agent/tasks/next`, {
    headers: { Authorization: `Bearer ${claimed.token}` },
  });
  assert(nextTask.status === 200, `agent task poll failed: ${nextTask.status}`);
  const polled = await nextTask.json();
  assert(polled.task?.id === chatTask.id, "machine agent received the wrong task");

  const resultPost = await fetch(`${base}/api/tpdf/agent/tasks/${chatTask.id}/result`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${claimed.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ result: "Machine agent response" }),
  });
  assert(resultPost.status === 200, `agent result submission failed: ${resultPost.status}`);

  const taskResult = await fetch(`${base}/api/tpdf/agent/tasks/${chatTask.id}`, {
    headers: { Cookie: cookie },
  });
  assert(taskResult.status === 200, `web task result lookup failed: ${taskResult.status}`);
  const completed = await taskResult.json();
  assert(
    completed.status === "completed" && completed.result === "Machine agent response",
    "machine agent result did not round-trip to the authenticated web session",
  );

  const clientEvent = await fetch(`${base}/api/tpdf/client-events`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "error-boundary",
      message: "production smoke client diagnostic",
      stack: "stack",
      componentStack: "component",
      buildSha: "smoke-sha",
      path: "/",
      occurredAt: new Date().toISOString(),
    }),
  });
  assert(clientEvent.status === 204, `client diagnostics endpoint failed: ${clientEvent.status}`);

  const crossSite = await fetch(`${base}/api/tpdf/auth/login`, {
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
    const response = await fetch(`${base}/api/tpdf/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@production.test",
        password: "wrong-password-2026",
      }),
    });
    assert(response.status === 401, `failed login ${attempt + 1} returned ${response.status}`);
  }

  const throttled = await fetch(`${base}/api/tpdf/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@production.test",
      password: "wrong-password-2026",
    }),
  });
  assert(throttled.status === 429, `login throttle did not return 429: ${throttled.status}`);
  assert(Number(throttled.headers.get("retry-after")) >= 1, "login throttle did not return Retry-After");

  const otherAccount = await fetch(`${base}/api/tpdf/auth/login`, {
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

  let logEntries = [];
  const logDir = join(dataDir, "logs");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    logEntries = [];
    const files = await readdir(logDir).catch(() => []);
    for (const file of files.filter((name) => name.endsWith(".jsonl"))) {
      const raw = await readFile(join(logDir, file), "utf8");
      logEntries.push(...raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)));
    }
    const hasReadyLog = logEntries.some((entry) =>
      entry.path === "/api/tpdf/ready" && entry.status === 200
    );
    const hasClientLog = logEntries.some((entry) =>
      entry.event === "client-error" && entry.client?.message === "production smoke client diagnostic"
    );
    if (hasReadyLog && hasClientLog) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert(logEntries.length > 0, "structured request log was not written");
  assert(
    logEntries.some((entry) =>
      entry.path === "/api/tpdf/ready" &&
      entry.status === 200 &&
      typeof entry.requestId === "string" &&
      Number.isFinite(entry.durationMs)
    ),
    "structured request log is missing readiness request fields",
  );
  assert(
    logEntries.some((entry) =>
      entry.event === "client-error" &&
      entry.client?.message === "production smoke client diagnostic" &&
      entry.client?.buildSha === "smoke-sha"
    ),
    "client crash diagnostic was not written to structured logs",
  );

  console.log("TPDF production hardening smoke passed.");
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
