// opdf-file-size-allow: self-contained fake S3 server validates SigV4 transport and cross-node multipart storage without external services.
import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createS3ObjectStore } from "./opdf-s3.mjs";
import { createS3OpdfStorage } from "./opdf-storage-s3.mjs";

const port = 21787;
const endpoint = `http://127.0.0.1:${port}`;
const bucket = "opdf-smoke";
const objects = new Map();
const multipart = new Map();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function etag(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function bodyBuffer(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function objectKey(url) {
  const prefix = `/${bucket}/`;
  if (!url.pathname.startsWith(prefix)) return null;
  return decodeURIComponent(url.pathname.slice(prefix.length));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", endpoint);
    const key = objectKey(url);
    const isBucket = url.pathname === `/${bucket}` || url.pathname === `/${bucket}/`;

    if (req.method === "GET" && isBucket && url.searchParams.get("list-type") === "2") {
      const prefix = url.searchParams.get("prefix") || "";
      const rows = [...objects.entries()]
        .filter(([name]) => name.startsWith(prefix))
        .sort(([a], [b]) => a.localeCompare(b));
      const xml = [
        "<ListBucketResult>",
        ...rows.map(([name, value]) =>
          `<Contents><Key>${xmlEscape(name)}</Key><ETag>&quot;${value.etag}&quot;</ETag><Size>${value.bytes.length}</Size></Contents>`),
        "</ListBucketResult>",
      ].join("");
      res.writeHead(200, { "Content-Type": "application/xml" });
      return res.end(xml);
    }

    if (!key) {
      res.statusCode = 404;
      return res.end();
    }

    const uploadId = url.searchParams.get("uploadId");
    if (req.method === "POST" && url.searchParams.has("uploads")) {
      const id = randomUUID();
      multipart.set(id, { key, parts: new Map() });
      res.writeHead(200, { "Content-Type": "application/xml" });
      return res.end(`<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
    }

    if (uploadId && req.method === "GET") {
      const upload = multipart.get(uploadId);
      if (!upload || upload.key !== key) {
        res.statusCode = 404;
        return res.end();
      }
      const xml = [
        "<ListPartsResult>",
        ...[...upload.parts.entries()]
          .sort(([a], [b]) => a - b)
          .map(([partNumber, part]) =>
            `<Part><PartNumber>${partNumber}</PartNumber><ETag>&quot;${part.etag}&quot;</ETag><Size>${part.bytes.length}</Size></Part>`),
        "</ListPartsResult>",
      ].join("");
      res.writeHead(200, { "Content-Type": "application/xml" });
      return res.end(xml);
    }

    if (uploadId && req.method === "PUT") {
      const upload = multipart.get(uploadId);
      const partNumber = Number(url.searchParams.get("partNumber"));
      if (!upload || upload.key !== key || !Number.isInteger(partNumber) || partNumber < 1) {
        res.statusCode = 404;
        return res.end();
      }
      const bytes = await bodyBuffer(req);
      const part = { bytes, etag: etag(bytes) };
      upload.parts.set(partNumber, part);
      res.writeHead(200, { ETag: `"${part.etag}"` });
      return res.end();
    }

    if (uploadId && req.method === "POST") {
      const upload = multipart.get(uploadId);
      if (!upload || upload.key !== key) {
        res.statusCode = 404;
        return res.end();
      }
      await bodyBuffer(req);
      const bytes = Buffer.concat(
        [...upload.parts.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, part]) => part.bytes),
      );
      const value = { bytes, etag: etag(bytes) };
      objects.set(key, value);
      multipart.delete(uploadId);
      res.writeHead(200, { "Content-Type": "application/xml", ETag: `"${value.etag}"` });
      return res.end("<CompleteMultipartUploadResult/>");
    }

    if (uploadId && req.method === "DELETE") {
      multipart.delete(uploadId);
      res.statusCode = 204;
      return res.end();
    }

    if (req.method === "PUT") {
      const current = objects.get(key);
      const ifNoneMatch = req.headers["if-none-match"];
      const ifMatch = String(req.headers["if-match"] || "").replace(/^"|"$/g, "");
      if (ifNoneMatch === "*" && current) {
        res.statusCode = 412;
        return res.end("PreconditionFailed");
      }
      if (ifMatch && (!current || current.etag !== ifMatch)) {
        res.statusCode = 412;
        return res.end("PreconditionFailed");
      }
      const bytes = await bodyBuffer(req);
      const value = { bytes, etag: etag(bytes) };
      objects.set(key, value);
      res.writeHead(200, { ETag: `"${value.etag}"` });
      return res.end();
    }

    const value = objects.get(key);
    if (req.method === "HEAD") {
      if (!value) {
        res.statusCode = 404;
        return res.end();
      }
      res.writeHead(200, {
        "Content-Length": String(value.bytes.length),
        ETag: `"${value.etag}"`,
      });
      return res.end();
    }

    if (req.method === "GET") {
      if (!value) {
        res.statusCode = 404;
        return res.end();
      }
      res.writeHead(200, {
        "Content-Length": String(value.bytes.length),
        ETag: `"${value.etag}"`,
      });
      return res.end(value.bytes);
    }

    if (req.method === "DELETE") {
      objects.delete(key);
      res.statusCode = 204;
      return res.end();
    }

    res.statusCode = 405;
    res.end();
  } catch (error) {
    res.statusCode = 500;
    res.end(error instanceof Error ? error.message : String(error));
  }
});

await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

const nodeA = await mkdtemp(join(tmpdir(), "opdf-s3-node-a-"));
const nodeB = await mkdtemp(join(tmpdir(), "opdf-s3-node-b-"));

try {
  const objectStore = createS3ObjectStore({
    endpoint,
    bucket,
    region: "us-east-1",
    accessKeyId: "smoke-access-key",
    secretAccessKey: "smoke-secret-key",
    prefix: "opdf",
    pathStyle: true,
  });

  const direct = Buffer.from("shared-object-storage");
  const firstWrite = await objectStore.put(
    "smoke/direct.txt",
    direct,
    "text/plain",
    { ifNoneMatch: "*" },
  );
  assert(
    Buffer.compare(await objectStore.get("smoke/direct.txt"), direct) === 0,
    "S3 direct put/get failed",
  );
  let staleWriteRejected = false;
  try {
    await objectStore.put(
      "smoke/direct.txt",
      Buffer.from("stale"),
      "text/plain",
      { ifMatch: "stale-etag" },
    );
  } catch {
    staleWriteRejected = true;
  }
  assert(staleWriteRejected, "S3 conditional write did not reject a stale ETag");
  await objectStore.put(
    "smoke/direct.txt",
    direct,
    "text/plain",
    { ifMatch: firstWrite.etag },
  );

  const prefix = "users/test-user/projects/default";
  const storageA = createS3OpdfStorage(nodeA, objectStore, prefix);
  const storageB = createS3OpdfStorage(nodeB, objectStore, prefix);
  await storageA.ensure();
  await storageB.ensure();

  const pdf = Buffer.from("%PDF-1.7\nOPDF S3 shared storage smoke\n%%EOF\n");
  const record = await storageA.createDocument("shared.pdf");
  await writeFile(record.pdfPath, pdf);
  await storageA.finalizeDocument(record.id, pdf.length);

  const fromOtherNode = await storageB.getDocument(record.id);
  assert(fromOtherNode?.id === record.id, "second node cannot resolve shared document metadata");
  assert(
    Buffer.compare(await readFile(fromOtherNode.pdfPath), pdf) === 0,
    "second node did not materialize shared PDF bytes",
  );

  await storageA.putAnnotations(record.id, [{ id: "shared", page: 1, kind: "note", payload: {} }]);
  const annotations = await storageB.getAnnotations(record.id);
  assert(annotations.length === 1 && annotations[0].id === "shared", "annotations are not shared across nodes");

  await storageA.putSession({
    activeFilePath: record.filePath,
    openTabs: [record.filePath],
    activeTabIndex: 0,
  });
  const session = await storageB.getSession();
  assert(session.activeFilePath === record.filePath, "session state is not shared across nodes");

  const firstPart = Buffer.concat([
    Buffer.from("%PDF-1.7\n"),
    Buffer.alloc((5 * 1024 * 1024) - 9, 65),
  ]);
  const secondPart = Buffer.from("\n%%EOF\n");
  const expectedSize = firstPart.length + secondPart.length;
  const chunkBytes = firstPart.length;

  const upload = await storageA.createDocument("multipart.pdf", expectedSize);
  await storageA.putUploadChunk(upload.id, 0, firstPart);

  const resumed = await storageB.getDocument(upload.id);
  assert(resumed?.multipartUploadId, "second node cannot resume multipart metadata");
  assert(
    (await storageB.listUploadedChunks(upload.id)).includes(0),
    "second node cannot see uploaded multipart part",
  );

  await storageB.putUploadChunk(upload.id, 1, secondPart);
  const completed = await storageB.completeUpload(upload.id, expectedSize, chunkBytes);
  assert(completed.size === expectedSize, "cross-node multipart completion has wrong size");

  const finalFromA = await storageA.getDocument(upload.id);
  const finalBytes = await readFile(finalFromA.pdfPath);
  assert(finalBytes.length === expectedSize, "first node cannot read completed multipart object");
  assert(finalBytes.subarray(0, 5).toString("ascii") === "%PDF-", "completed multipart PDF signature is wrong");

  console.log("OPDF S3 shared-storage smoke passed.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(nodeA, { recursive: true, force: true });
  await rm(nodeB, { recursive: true, force: true });
}
