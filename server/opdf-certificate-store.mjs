import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { inspectP12Certificate } from "@opdf/core";

function safeName(value) {
  const cleaned = String(value || "certificate.p12")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .trim();
  return cleaned.slice(0, 160) || "certificate.p12";
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

export function createCertificateStore(dataDir, masterSecret) {
  const root = resolve(dataDir, "certificates");
  const enabled = typeof masterSecret === "string" && masterSecret.length >= 16;
  const key = enabled
    ? scryptSync(masterSecret, "opdf-certificate-store-v1", 32)
    : null;

  function assertEnabled() {
    if (!key) {
      throw new Error(
        "Server certificate storage is disabled. Configure OPDF_CERTIFICATE_MASTER_KEY with at least 16 characters.",
      );
    }
  }

  function encrypt(bytes) {
    assertEnabled();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from(bytes)), cipher.final()]);
    return {
      version: 1,
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
  }

  function decrypt(envelope) {
    assertEnabled();
    if (envelope?.version !== 1 || envelope?.algorithm !== "aes-256-gcm") {
      throw new Error("Unsupported certificate envelope.");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(envelope.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    return new Uint8Array(
      Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]),
    );
  }

  async function list() {
    if (!enabled) return [];
    await mkdir(root, { recursive: true });
    const names = await readdir(root).catch(() => []);
    const rows = [];
    for (const name of names) {
      if (!/^[0-9a-f-]{36}$/i.test(name)) continue;
      const meta = await readJson(join(root, name, "meta.json"));
      if (meta?.id === name) rows.push(meta);
    }
    return rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  async function store(bytes, passphrase = "", fileName = "certificate.p12") {
    assertEnabled();
    if (!bytes?.length) throw new Error("P12/PFX certificate is empty.");
    const certificate = inspectP12Certificate(bytes, passphrase);
    const fingerprint = createHash("sha256").update(bytes).digest("hex");
    const existing = (await list()).find((row) => row.fingerprint === fingerprint);
    if (existing) return existing;

    const id = randomUUID();
    const dir = join(root, id);
    const meta = {
      id,
      fileName: safeName(fileName),
      fingerprint,
      certificate,
      createdAt: Date.now(),
    };
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "certificate.json"), JSON.stringify(encrypt(bytes)), {
      encoding: "utf8",
      mode: 0o600,
    });
    await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    return meta;
  }

  async function getBytes(id) {
    assertEnabled();
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid certificate id.");
    const envelope = await readJson(join(root, id, "certificate.json"));
    if (!envelope) throw new Error("Certificate not found.");
    return decrypt(envelope);
  }

  async function remove(id) {
    assertEnabled();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
    const dir = join(root, id);
    const meta = await readJson(join(dir, "meta.json"));
    if (!meta) return false;
    await rm(dir, { recursive: true, force: true });
    return true;
  }

  return {
    enabled,
    async ensure() {
      if (enabled) await mkdir(root, { recursive: true });
    },
    list,
    store,
    getBytes,
    remove,
  };
}
