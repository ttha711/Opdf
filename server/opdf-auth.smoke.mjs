import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { createServerAuth } from "./opdf-auth.mjs";

const port = 20787;
const dataDir = await mkdtemp(join(tmpdir(), "opdf-auth-smoke-"));
const base = `http://127.0.0.1:${port}`;
const tokenA = "opdf-user-a-token-12345";
const tokenB = "opdf-user-b-token-67890";
const tokenConfig = {
  [tokenA]: {
    userId: "alice",
    displayName: "Alice",
    quotaBytes: 2048,
    projects: ["default", "alpha"],
  },
  [tokenB]: {
    userId: "bob",
    displayName: "Bob",
    quotaBytes: 10 * 1024 * 1024,
    projects: ["default"],
  },
};

const child = spawn(process.execPath, ["server/opdf-server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    OPDF_PORT: String(port),
    OPDF_DATA_DIR: dataDir,
    OPDF_WEB_DIST: join(process.cwd(), "apps", "web", "dist"),
    OPDF_AUTH_MODE: "token",
    OPDF_AUTH_TOKENS: JSON.stringify(tokenConfig),
    OPDF_DEFAULT_USER_QUOTA_BYTES: String(5 * 1024 * 1024),
    OPDF_CERTIFICATE_MASTER_KEY: "opdf-auth-smoke-master-key",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (chunk) => { stderr += String(chunk); });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForHealth() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/opdf/health`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Auth smoke server did not start. ${stderr}`);
}

async function login(token) {
  const response = await fetch(`${base}/api/opdf/auth/session`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(response.ok, `login failed: ${response.status}`);
  const rawCookie = response.headers.get("set-cookie") || "";
  const sessionCookie = rawCookie.split(";")[0];
  assert(sessionCookie.startsWith("opdf_session="), "login did not set OPDF session cookie");
  return sessionCookie;
}

function withCookie(cookie, init = {}) {
  return {
    ...init,
    headers: {
      ...(init.headers || {}),
      Cookie: cookie,
    },
  };
}

async function json(response) {
  const body = await response.json();
  return { response, body };
}

try {
  const health = await waitForHealth();
  assert(health.capabilities?.multiUserAuth === true, "health must expose multi-user auth");
  assert(health.capabilities?.perUserProjectStorage === true, "health must expose tenant storage");
  assert(health.capabilities?.quotas === true, "health must expose quotas");

  const root = await fetch(`${base}/`);
  assert(root.ok && (await root.text()).includes("OPDF Sign in"), "token mode must serve login page");

  const denied = await fetch(`${base}/api/opdf/recent`);
  assert(denied.status === 401, "unauthenticated API request must return 401");

  const aliceCookie = await login(tokenA);
  const bobCookie = await login(tokenB);

  const me = await json(await fetch(`${base}/api/opdf/auth/me`, withCookie(aliceCookie)));
  assert(me.response.ok, "auth/me failed");
  assert(me.body.userId === "alice", "auth/me returned the wrong user");
  assert(me.body.projectId === "default", "default project is wrong");
  assert(me.body.quotaBytes === 2048, "per-user quota is wrong");

  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]).drawText("Alice private PDF", { x: 20, y: 100, size: 12 });
  const pdfBytes = Buffer.from(await pdf.save());

  const upload = await fetch(
    `${base}/api/opdf/documents?name=alice.pdf`,
    withCookie(aliceCookie, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: pdfBytes,
    }),
  );
  assert(upload.status === 201, `Alice upload failed: ${upload.status}`);
  const document = await upload.json();

  const ownFetch = await fetch(
    `${base}/api/opdf/documents/${document.id}`,
    withCookie(aliceCookie),
  );
  assert(ownFetch.ok, "Alice cannot read her own document");

  const crossUser = await fetch(
    `${base}/api/opdf/documents/${document.id}`,
    withCookie(bobCookie),
  );
  assert(crossUser.status === 404, "Bob must not discover Alice's document");

  const bobRecents = await fetch(`${base}/api/opdf/recent`, withCookie(bobCookie)).then((r) => r.json());
  assert(bobRecents.length === 0, "Bob must not see Alice recents");

  const aliceSessionWrite = await fetch(
    `${base}/api/opdf/session`,
    withCookie(aliceCookie, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activeFilePath: document.filePath,
        openTabs: [document.filePath],
        activeTabIndex: 0,
      }),
    }),
  );
  assert(aliceSessionWrite.ok, "Alice session write failed");

  const bobSession = await fetch(`${base}/api/opdf/session`, withCookie(bobCookie)).then((r) => r.json());
  assert(bobSession.activeFilePath === null, "Bob must not see Alice session");

  const createProject = await fetch(
    `${base}/api/opdf/projects`,
    withCookie(aliceCookie, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "alpha" }),
    }),
  );
  assert(createProject.status === 201, "Alice project creation failed");

  const selectProject = await fetch(
    `${base}/api/opdf/projects/select`,
    withCookie(aliceCookie, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "alpha" }),
    }),
  );
  assert(selectProject.ok, "Alice project selection failed");
  const projectCookie = (selectProject.headers.get("set-cookie") || "").split(";")[0];
  assert(projectCookie.startsWith("opdf_project="), "project selection did not set cookie");
  const alphaCookies = `${aliceCookie}; ${projectCookie}`;

  const crossProject = await fetch(
    `${base}/api/opdf/documents/${document.id}`,
    withCookie(alphaCookies),
  );
  assert(crossProject.status === 404, "Projects must isolate documents for the same user");

  const forbiddenProject = await fetch(
    `${base}/api/opdf/projects/select`,
    withCookie(bobCookie, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "alpha" }),
    }),
  );
  assert(forbiddenProject.status === 403, "project allowlist must be enforced");

  const quota = await fetch(
    `${base}/api/opdf/uploads?name=too-large.pdf&size=1800`,
    withCookie(aliceCookie, { method: "POST" }),
  );
  assert(quota.status === 413, "quota must reject resumable upload before session creation");

  const meAfter = await fetch(`${base}/api/opdf/auth/me`, withCookie(aliceCookie)).then((r) => r.json());
  assert(meAfter.usageBytes >= pdfBytes.length, "usage accounting did not include uploaded PDF");

  const cloudflareAuth = createServerAuth({
    OPDF_AUTH_MODE: "cloudflare",
    OPDF_CLOUDFLARE_ALLOWED_EMAILS: "allowed@example.com",
    OPDF_DEFAULT_USER_QUOTA_BYTES: "4096",
  });
  const cfContext = cloudflareAuth.authenticate(
    { headers: { "cf-access-authenticated-user-email": "allowed@example.com" } },
    new URL("https://opdf.local/api/opdf/auth/me"),
  );
  assert(cfContext.userId && cfContext.email === "allowed@example.com", "Cloudflare identity auth failed");

  let deniedCf = false;
  try {
    cloudflareAuth.authenticate(
      { headers: { "cf-access-authenticated-user-email": "blocked@example.com" } },
      new URL("https://opdf.local/api/opdf/auth/me"),
    );
  } catch (error) {
    deniedCf = error?.status === 403;
  }
  assert(deniedCf, "Cloudflare email allowlist must reject unknown users");

  console.log("OPDF auth/tenant/quota smoke test passed.");
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  await rm(dataDir, { recursive: true, force: true });
}
