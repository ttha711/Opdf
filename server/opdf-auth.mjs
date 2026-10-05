import {
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE_NAME = "opdf_session";

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new Error("A valid email is required.");
  return email;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    quotaBytes: user.quotaBytes,
    disabled: Boolean(user.disabled),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12) {
    throw new Error("Password must be at least 12 characters.");
  }
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt-v1$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

function verifyPassword(password, encoded) {
  try {
    const [version, saltText, digestText] = String(encoded || "").split("$");
    if (version !== "scrypt-v1" || !saltText || !digestText) return false;
    const expected = Buffer.from(digestText, "base64url");
    const actual = scryptSync(String(password || ""), Buffer.from(saltText, "base64url"), expected.length, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function parseCookies(req) {
  const header = typeof req.headers.cookie === "string" ? req.headers.cookie : "";
  const result = {};
  for (const item of header.split(";")) {
    const index = item.indexOf("=");
    if (index <= 0) continue;
    result[item.slice(0, index).trim()] = decodeURIComponent(item.slice(index + 1).trim());
  }
  return result;
}

function encodedJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function createAuthService(dataDir, env = process.env) {
  const root = resolve(dataDir, "auth");
  const usersPath = join(root, "users.json");
  const mode = String(env.OPDF_AUTH_MODE || (env.OPDF_AUTH_SECRET ? "local" : "disabled")).toLowerCase();
  const enabled = mode !== "disabled";
  const secret = String(env.OPDF_AUTH_SECRET || "");
  const sessionHours = Math.max(1, Math.min(Number(env.OPDF_SESSION_HOURS || 12), 168));
  const defaultQuotaBytes = Math.max(
    64 * 1024 * 1024,
    Number(env.OPDF_DEFAULT_USER_QUOTA_BYTES || 10 * 1024 * 1024 * 1024),
  );
  let users = [];

  if (enabled && mode !== "local") throw new Error("OPDF_AUTH_MODE must be local or disabled.");
  if (enabled && secret.length < 32) throw new Error("OPDF_AUTH_SECRET must be at least 32 characters.");

  async function persist() {
    await mkdir(root, { recursive: true });
    const temp = `${usersPath}.${randomUUID()}.tmp`;
    await writeFile(
      temp,
      JSON.stringify({ version: 1, users }, null, 2) + "\n",
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temp, usersPath);
  }

  async function ensure() {
    await mkdir(root, { recursive: true });
    if (!enabled) return;
    try {
      const payload = JSON.parse(await readFile(usersPath, "utf8"));
      if (!Array.isArray(payload?.users)) throw new Error("Invalid OPDF user database.");
      users = payload.users;
    } catch (error) {
      if (error?.code === "ENOENT") users = [];
      else throw new Error("OPDF user database is unreadable or corrupt; refusing to start authentication.");
    }

    if (!enabled || users.length > 0) return;
    if (!env.OPDF_BOOTSTRAP_EMAIL || !env.OPDF_BOOTSTRAP_PASSWORD) {
      throw new Error(
        "Local auth has no users. Set OPDF_BOOTSTRAP_EMAIL and OPDF_BOOTSTRAP_PASSWORD for first start.",
      );
    }

    const now = Date.now();
    users = [{
      id: randomUUID(),
      email: normalizeEmail(env.OPDF_BOOTSTRAP_EMAIL),
      passwordHash: hashPassword(env.OPDF_BOOTSTRAP_PASSWORD),
      role: "admin",
      quotaBytes: defaultQuotaBytes,
      disabled: false,
      createdAt: now,
      updatedAt: now,
    }];
    await persist();
  }

  function sign(payload) {
    return createHmac("sha256", secret).update(payload).digest("base64url");
  }

  function issueToken(user) {
    const now = Math.floor(Date.now() / 1000);
    const payload = encodedJson({
      sub: user.id,
      iat: now,
      exp: now + Math.trunc(sessionHours * 3600),
      nonce: randomBytes(12).toString("base64url"),
    });
    return `${payload}.${sign(payload)}`;
  }

  function verifyToken(token) {
    if (!enabled || typeof token !== "string") return null;
    const [payloadText, signature] = token.split(".");
    if (!payloadText || !signature) return null;
    const expected = sign(payloadText);
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
    try {
      const payload = JSON.parse(Buffer.from(payloadText, "base64url").toString("utf8"));
      if (!payload?.sub || !Number.isFinite(payload.exp)) return null;
      if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
      return payload;
    } catch {
      return null;
    }
  }

  function userById(id) {
    const user = users.find((row) => row.id === id);
    return user && !user.disabled ? user : null;
  }

  function getRequestUser(req) {
    if (!enabled) {
      return {
        id: "local-single-user",
        email: "local@opdf.invalid",
        role: "admin",
        quotaBytes: Number.MAX_SAFE_INTEGER,
        disabled: false,
        createdAt: 0,
        updatedAt: 0,
      };
    }
    const bearer = typeof req.headers.authorization === "string" &&
      req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice(7).trim()
      : null;
    const token = bearer || parseCookies(req)[COOKIE_NAME];
    const payload = verifyToken(token);
    return payload ? userById(payload.sub) : null;
  }

  function setSessionCookie(req, res, token) {
    const secure =
      String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "https" ||
      env.OPDF_COOKIE_SECURE === "1";
    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.trunc(sessionHours * 3600)}${secure ? "; Secure" : ""}`,
    );
  }

  function clearSessionCookie(req, res) {
    const secure =
      String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "https" ||
      env.OPDF_COOKIE_SECURE === "1";
    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`,
    );
  }

  async function authenticate(emailValue, password) {
    let email;
    try {
      email = normalizeEmail(emailValue);
    } catch {
      return null;
    }
    const user = users.find((row) => row.email === email && !row.disabled);
    if (!user || !verifyPassword(password, user.passwordHash)) return null;
    return user;
  }

  async function createUser(input) {
    const email = normalizeEmail(input?.email);
    if (users.some((row) => row.email === email)) throw new Error("User already exists.");
    const role = input?.role === "admin" ? "admin" : "user";
    const quotaBytes = Number.isFinite(Number(input?.quotaBytes))
      ? Math.max(64 * 1024 * 1024, Math.trunc(Number(input.quotaBytes)))
      : defaultQuotaBytes;
    const now = Date.now();
    const user = {
      id: randomUUID(),
      email,
      passwordHash: hashPassword(input?.password),
      role,
      quotaBytes,
      disabled: false,
      createdAt: now,
      updatedAt: now,
    };
    users.push(user);
    await persist();
    return publicUser(user);
  }

  async function updateUser(id, patch) {
    const user = users.find((row) => row.id === id);
    if (!user) return null;
    if (patch?.role === "admin" || patch?.role === "user") user.role = patch.role;
    if (typeof patch?.disabled === "boolean") user.disabled = patch.disabled;
    if (Number.isFinite(Number(patch?.quotaBytes))) {
      user.quotaBytes = Math.max(64 * 1024 * 1024, Math.trunc(Number(patch.quotaBytes)));
    }
    if (typeof patch?.password === "string" && patch.password.length > 0) {
      user.passwordHash = hashPassword(patch.password);
    }
    user.updatedAt = Date.now();
    await persist();
    return publicUser(user);
  }

  return {
    enabled,
    mode,
    ensure,
    publicUser,
    getRequestUser,
    issueToken,
    setSessionCookie,
    clearSessionCookie,
    authenticate,
    sessionHours,
    listUsers: () => users.map(publicUser),
    createUser,
    updateUser,
  };
}
