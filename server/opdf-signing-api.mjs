import {
  inspectP12Certificate,
  inspectPdfSignatures,
  signPdfWithP12,
} from "@opdf/core";

async function readBinaryBody(req, limit = 10 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new Error("Certificate payload is too large.");
    chunks.push(chunk);
  }
  if (total === 0) throw new Error("Certificate payload is empty.");
  return new Uint8Array(Buffer.concat(chunks));
}

function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createSigningApi({
  certificateStore,
  getCertificateStore,
  sendJson,
  sendError,
  sendPdf,
  readPdfBody,
  parseOperationOptions,
}) {
  async function storeFor(req, url) {
    const store = getCertificateStore
      ? await getCertificateStore(req, url)
      : certificateStore;
    if (!store) throw new Error("Certificate store is not configured.");
    return store;
  }

  async function handleCertificates(req, res, url) {
    if (url.pathname === "/api/opdf/certificates/inspect") {
      if (req.method !== "POST") return sendError(res, 405, "Method not allowed.");
      const options = parseOperationOptions(req);
      const bytes = await readBinaryBody(req);
      return sendJson(
        res,
        200,
        inspectP12Certificate(bytes, asString(options.passphrase)),
      );
    }

    if (url.pathname === "/api/opdf/certificates") {
      const store = await storeFor(req, url);
      if (req.method === "GET") {
        if (!store.enabled) return sendJson(res, 200, []);
        return sendJson(res, 200, await store.list());
      }
      if (req.method === "POST") {
        if (!store.enabled) {
          return sendError(res, 503, "Server certificate storage is not configured.");
        }
        const options = parseOperationOptions(req);
        const bytes = await readBinaryBody(req);
        const record = await store.store(
          bytes,
          asString(options.passphrase),
          asString(options.fileName, "certificate.p12"),
        );
        return sendJson(res, 201, record);
      }
      return sendError(res, 405, "Method not allowed.");
    }

    const match = url.pathname.match(/^\/api\/opdf\/certificates\/([0-9a-f-]{36})$/i);
    if (match) {
      if (req.method !== "DELETE") return sendError(res, 405, "Method not allowed.");
      const store = await storeFor(req, url);
      if (!store.enabled) {
        return sendError(res, 503, "Server certificate storage is not configured.");
      }
      const removed = await store.remove(match[1]);
      return removed
        ? sendJson(res, 200, { removed: true })
        : sendError(res, 404, "Certificate not found.");
    }

    return false;
  }

  async function handleOperations(req, res, url) {
    if (url.pathname === "/api/opdf/operations/inspect-signatures") {
      if (req.method !== "POST") return sendError(res, 405, "Method not allowed.");
      const input = await readPdfBody(req);
      return sendJson(res, 200, inspectPdfSignatures(input));
    }

    if (url.pathname !== "/api/opdf/operations/sign-p12") return false;
    if (req.method !== "POST") return sendError(res, 405, "Method not allowed.");
    const store = await storeFor(req, url);
    if (!store.enabled) {
      return sendError(res, 503, "Server certificate storage is not configured.");
    }

    const options = parseOperationOptions(req);
    const certificateId = asString(options.certificateId);
    if (!/^[0-9a-f-]{36}$/i.test(certificateId)) {
      return sendError(res, 400, "certificateId is required.");
    }

    const input = await readPdfBody(req);
    const certificateBytes = await store.getBytes(certificateId);
    const result = await signPdfWithP12(input, certificateBytes, {
      passphrase: asString(options.passphrase),
      page: asNumber(options.page, 1),
      reason: asString(options.reason, "Document approval"),
      location: asString(options.location),
      contactInfo: asString(options.contactInfo),
      x: asNumber(options.x, 0.62),
      y: asNumber(options.y, 0.84),
      width: asNumber(options.width, 0.32),
      height: asNumber(options.height, 0.10),
    });

    res.setHeader(
      "X-OPDF-Certificate-Info",
      Buffer.from(JSON.stringify(result.certificate), "utf8").toString("base64url"),
    );
    return sendPdf(res, result.bytes);
  }

  return async function handleSigningApi(req, res, url) {
    if (
      url.pathname === "/api/opdf/certificates" ||
      url.pathname === "/api/opdf/certificates/inspect" ||
      url.pathname.startsWith("/api/opdf/certificates/")
    ) {
      return handleCertificates(req, res, url);
    }
    if (
      url.pathname === "/api/opdf/operations/sign-p12" ||
      url.pathname === "/api/opdf/operations/inspect-signatures"
    ) {
      return handleOperations(req, res, url);
    }
    return false;
  };
}
