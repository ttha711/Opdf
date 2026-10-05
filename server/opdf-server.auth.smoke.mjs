import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";

const port = 20787;
const dataDir = await mkdtemp(join(tmpdir(), "opdf-auth-smoke-"));
const base = `http://127.0.0.1:${port}`;
let child;
let stderr = "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function startServer() {
  child = spawn(process.execPath, ["server/opdf-server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      OPDF_PORT: String(port),
      OPDF_DATA_DIR: dataDir,
      OPDF_WEB_DIST: join(process.cwd(), "apps", "web", "dist"),
      OPDF_AUTH_MODE: "local",
      OPDF_AUTH_SECRET: "opdf-auth-smoke-secret-that-is-long-enough-2026",
      OPDF_BOOTSTRAP_EMAIL: "admin@opdf.test",
      OPDF_BOOTSTRAP_PASSWORD: "admin-password-2026",
      OPDF_DEFAULT_USER_QUOTA_BYTES: String(64 * 1024 * 1024),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/opdf/auth/me`);
      if (response.status === 401) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Auth server did not start. ${stderr}`);
}

async function stopServer() {
  if (!child) return;
  const current = child;
  child = undefined;
  current.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => current.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}

async function login(email, password) {
  const response = await fetch(`${base}/api/opdf/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert(response.ok, `login failed for ${email}: ${response.status}`);
  const cookie = response.headers.get("set-cookie");
  assert(cookie?.includes("opdf_session="), "login did not issue a session cookie");
  return cookie.split(";")[0];
}

async function createPdf() {
  const doc = await PDFDocument.create();
  doc.addPage([320, 240]);
  return Buffer.from(await doc.save());
}

try {
  await startServer();

  const anonymous = await fetch(`${base}/api/opdf/health`);
  assert(anonymous.status === 401, "protected API accepted anonymous request");

  const adminCookie = await login("admin@opdf.test", "admin-password-2026");
  const me = await fetch(`${base}/api/opdf/auth/me`, {
    headers: { Cookie: adminCookie },
  }).then((response) => response.json());
  assert(me.user?.role === "admin", "bootstrap account is not admin");

  const createUser = await fetch(`${base}/api/opdf/admin/users`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: "reader@opdf.test",
      password: "reader-password-2026",
      quotaBytes: 64 * 1024 * 1024,
    }),
  });
  assert(createUser.status === 201, `admin could not create user: ${createUser.status}`);

  const pdf = await createPdf();
  const upload = await fetch(`${base}/api/opdf/documents?name=admin.pdf`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/pdf",
    },
    body: pdf,
  });
  assert(upload.status === 201, `admin upload failed: ${upload.status}`);
  const document = await upload.json();

  const readerCookie = await login("reader@opdf.test", "reader-password-2026");
  const crossUser = await fetch(`${base}/api/opdf/documents/${document.id}`, {
    headers: { Cookie: readerCookie },
  });
  assert(crossUser.status === 404, "second user accessed another user's document by UUID");

  const crossProject = await fetch(`${base}/api/opdf/documents/${document.id}`, {
    headers: {
      Cookie: adminCookie,
      "X-OPDF-Project": "project-b",
    },
  });
  assert(crossProject.status === 404, "project boundary leaked a document");

  const projectCreate = await fetch(`${base}/api/opdf/projects`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: "engineering" }),
  });
  assert(projectCreate.status === 201, "project creation failed");

  const user = await createUser.json();
  const quotaUpdate = await fetch(`${base}/api/opdf/admin/users/${user.id}`, {
    method: "PATCH",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ quotaBytes: 64 * 1024 * 1024 }),
  });
  assert(quotaUpdate.ok, "quota update failed");

  const oversized = await fetch(
    `${base}/api/opdf/uploads?name=too-large.pdf&size=${65 * 1024 * 1024}`,
    {
      method: "POST",
      headers: { Cookie: readerCookie },
    },
  );
  assert(oversized.status === 413, `quota bypass accepted oversized resumable upload: ${oversized.status}`);

  const usersDenied = await fetch(`${base}/api/opdf/admin/users`, {
    headers: { Cookie: readerCookie },
  });
  assert(usersDenied.status === 403, "non-admin user accessed admin API");

  console.log("OPDF multi-user auth/quota/storage smoke passed.");
} finally {
  await stopServer();
  await rm(dataDir, { recursive: true, force: true });
}
