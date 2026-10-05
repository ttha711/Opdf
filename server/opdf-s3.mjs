// opdf-file-size-allow: S3 SigV4 transport keeps signing and multipart protocol in one audited module.
import { createHash, createHmac } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

function encodePath(value) {
  return String(value)
    .split("/")
    .map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

function canonicalQuery(entries) {
  return [...entries]
    .map(([key, value]) => [
      encodeURIComponent(key).replace(/[!'()*]/g, (char) =>
        `%${char.charCodeAt(0).toString(16).toUpperCase()}`),
      encodeURIComponent(value ?? "").replace(/[!'()*]/g, (char) =>
        `%${char.charCodeAt(0).toString(16).toUpperCase()}`),
    ])
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function xmlDecode(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlText(xml, tag) {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(xml);
  return match ? xmlDecode(match[1]) : "";
}

function stripQuotes(value) {
  return String(value || "").replace(/^"|"$/g, "");
}

export function createS3ObjectStore(config = {}) {
  const endpoint = new URL(config.endpoint);
  const bucket = String(config.bucket || "").trim();
  const region = String(config.region || "us-east-1");
  const accessKeyId = String(config.accessKeyId || "");
  const secretAccessKey = String(config.secretAccessKey || "");
  const prefix = String(config.prefix || "").replace(/^\/+|\/+$/g, "");
  const pathStyle = config.pathStyle !== false;

  if (!bucket) throw new Error("S3 bucket is required.");
  if (!accessKeyId || !secretAccessKey) throw new Error("S3 credentials are required.");

  function prefixed(key) {
    const clean = String(key || "").replace(/^\/+/, "");
    return prefix ? `${prefix}/${clean}` : clean;
  }

  function objectUrl(key, queryEntries = []) {
    const fullKey = prefixed(key);
    const url = new URL(endpoint.toString());
    if (pathStyle) {
      url.pathname = `${endpoint.pathname.replace(/\/$/, "")}/${encodePath(bucket)}/${encodePath(fullKey)}`;
    } else {
      url.hostname = `${bucket}.${endpoint.hostname}`;
      url.pathname = `${endpoint.pathname.replace(/\/$/, "")}/${encodePath(fullKey)}`;
    }
    url.search = canonicalQuery(queryEntries);
    return url;
  }

  function bucketUrl(queryEntries = []) {
    const url = new URL(endpoint.toString());
    if (pathStyle) {
      url.pathname = `${endpoint.pathname.replace(/\/$/, "")}/${encodePath(bucket)}`;
    } else {
      url.hostname = `${bucket}.${endpoint.hostname}`;
      url.pathname = endpoint.pathname || "/";
    }
    url.search = canonicalQuery(queryEntries);
    return url;
  }

  function signingKey(dateStamp) {
    const kDate = hmac(Buffer.from(`AWS4${secretAccessKey}`), dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, "s3");
    return hmac(kService, "aws4_request");
  }

  async function signedFetch(method, url, options = {}) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = options.payloadHash || "UNSIGNED-PAYLOAD";
    const headers = new Headers(options.headers || {});
    headers.set("host", url.host);
    headers.set("x-amz-content-sha256", payloadHash);
    headers.set("x-amz-date", amzDate);

    const signedHeaderNames = [...headers.keys()]
      .map((name) => name.toLowerCase())
      .sort()
      .filter((name, index, rows) => index === 0 || name !== rows[index - 1]);
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${String(headers.get(name) || "").trim().replace(/\s+/g, " ")}\n`)
      .join("");
    const canonicalRequest = [
      method,
      url.pathname,
      url.search ? url.search.slice(1) : "",
      canonicalHeaders,
      signedHeaderNames.join(";"),
      payloadHash,
    ].join("\n");
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");
    const signature = hmac(signingKey(dateStamp), stringToSign, "hex");
    headers.set(
      "authorization",
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`,
    );

    const response = await fetch(url, {
      method,
      headers,
      body: options.body,
      ...(options.body && typeof options.body.pipe === "function" ? { duplex: "half" } : {}),
    });
    return response;
  }

  async function checked(response, allowed = [200, 201, 204, 206]) {
    if (allowed.includes(response.status)) return response;
    if (response.status === 404) return null;
    const body = await response.text().catch(() => "");
    const error = new Error(
      `S3 request failed: HTTP ${response.status}${body ? ` · ${body.slice(0, 300)}` : ""}`,
    );
    error.statusCode = response.status === 409 || response.status === 412 ? 409 : 502;
    error.s3Status = response.status;
    throw error;
  }

  async function get(key) {
    const response = await checked(await signedFetch("GET", objectUrl(key)));
    if (!response) return null;
    return Buffer.from(await response.arrayBuffer());
  }

  async function getToFile(key, path) {
    const response = await checked(await signedFetch("GET", objectUrl(key)));
    if (!response) return false;
    await mkdir(dirname(path), { recursive: true });
    if (!response.body) throw new Error("S3 response body is empty.");
    await pipeline(Readable.fromWeb(response.body), createWriteStream(path));
    return true;
  }

  async function put(key, bytes, contentType = "application/octet-stream", condition = {}) {
    const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const payloadHash = sha256Hex(body);
    const headers = {
      "content-length": String(body.length),
      "content-type": contentType,
    };
    if (condition.ifMatch) headers["if-match"] = `"${stripQuotes(condition.ifMatch)}"`;
    if (condition.ifNoneMatch) headers["if-none-match"] = condition.ifNoneMatch;
    const response = await checked(await signedFetch("PUT", objectUrl(key), {
      body,
      payloadHash,
      headers,
    }));
    return { etag: stripQuotes(response.headers.get("etag")) };
  }

  async function putFile(key, path, size, contentType = "application/octet-stream") {
    const response = await checked(await signedFetch("PUT", objectUrl(key), {
      body: createReadStream(path),
      payloadHash: "UNSIGNED-PAYLOAD",
      headers: {
        "content-length": String(size),
        "content-type": contentType,
      },
    }));
    return { etag: stripQuotes(response.headers.get("etag")) };
  }

  async function head(key) {
    const response = await checked(await signedFetch("HEAD", objectUrl(key)));
    if (!response) return null;
    return {
      size: Number(response.headers.get("content-length") || 0),
      etag: stripQuotes(response.headers.get("etag")),
      lastModified: response.headers.get("last-modified") || "",
    };
  }

  async function remove(key) {
    const response = await checked(await signedFetch("DELETE", objectUrl(key)), [200, 204]);
    return Boolean(response);
  }

  async function list(keyPrefix = "") {
    const targetPrefix = prefixed(keyPrefix);
    const rows = [];
    let continuationToken = "";

    do {
      const query = [["list-type", "2"], ["prefix", targetPrefix]];
      if (continuationToken) query.push(["continuation-token", continuationToken]);
      const response = await checked(await signedFetch("GET", bucketUrl(query)));
      if (!response) return rows;
      const xml = await response.text();
      const pattern = /<Contents>([\s\S]*?)<\/Contents>/g;
      let match;
      while ((match = pattern.exec(xml))) {
        const fullKey = xmlText(match[1], "Key");
        const logicalKey = prefix && fullKey.startsWith(`${prefix}/`)
          ? fullKey.slice(prefix.length + 1)
          : fullKey;
        rows.push({
          key: logicalKey,
          size: Number(xmlText(match[1], "Size") || 0),
          etag: stripQuotes(xmlText(match[1], "ETag")),
        });
      }
      const truncated = xmlText(xml, "IsTruncated").toLowerCase() === "true";
      continuationToken = truncated ? xmlText(xml, "NextContinuationToken") : "";
      if (truncated && !continuationToken) {
        throw new Error("S3 listing is truncated but no continuation token was returned.");
      }
    } while (continuationToken);

    return rows;
  }

  async function createMultipart(key, contentType = "application/pdf") {
    const response = await checked(await signedFetch(
      "POST",
      objectUrl(key, [["uploads", ""]]),
      { headers: { "content-type": contentType }, payloadHash: sha256Hex("") },
    ));
    const uploadId = xmlText(await response.text(), "UploadId");
    if (!uploadId) throw new Error("S3 multipart upload did not return an UploadId.");
    return uploadId;
  }

  async function listParts(key, uploadId) {
    const response = await checked(await signedFetch(
      "GET",
      objectUrl(key, [["uploadId", uploadId]]),
    ));
    if (!response) return [];
    const xml = await response.text();
    const rows = [];
    const pattern = /<Part>([\s\S]*?)<\/Part>/g;
    let match;
    while ((match = pattern.exec(xml))) {
      rows.push({
        partNumber: Number(xmlText(match[1], "PartNumber")),
        etag: stripQuotes(xmlText(match[1], "ETag")),
        size: Number(xmlText(match[1], "Size") || 0),
      });
    }
    return rows
      .filter((part) => Number.isInteger(part.partNumber) && part.partNumber > 0 && part.etag)
      .sort((a, b) => a.partNumber - b.partNumber);
  }

  async function uploadPart(key, uploadId, partNumber, bytes) {
    const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const response = await checked(await signedFetch(
      "PUT",
      objectUrl(key, [["partNumber", String(partNumber)], ["uploadId", uploadId]]),
      {
        body,
        payloadHash: sha256Hex(body),
        headers: { "content-length": String(body.length) },
      },
    ));
    const etag = stripQuotes(response.headers.get("etag"));
    if (!etag) throw new Error("S3 multipart part did not return an ETag.");
    return etag;
  }

  async function completeMultipart(key, uploadId, parts) {
    const xml = [
      "<CompleteMultipartUpload>",
      ...parts.map((part) =>
        `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>&quot;${part.etag}&quot;</ETag></Part>`),
      "</CompleteMultipartUpload>",
    ].join("");
    const body = Buffer.from(xml, "utf8");
    const response = await checked(await signedFetch(
      "POST",
      objectUrl(key, [["uploadId", uploadId]]),
      {
        body,
        payloadHash: sha256Hex(body),
        headers: {
          "content-length": String(body.length),
          "content-type": "application/xml",
        },
      },
    ));
    return response.text();
  }

  async function abortMultipart(key, uploadId) {
    await checked(await signedFetch(
      "DELETE",
      objectUrl(key, [["uploadId", uploadId]]),
    ), [200, 204]);
  }

  return {
    kind: "s3",
    endpoint: endpoint.origin,
    bucket,
    region,
    prefix,
    get,
    getToFile,
    put,
    putFile,
    head,
    remove,
    list,
    createMultipart,
    listParts,
    uploadPart,
    completeMultipart,
    abortMultipart,
  };
}

export function createS3ObjectStoreFromEnv(env = process.env) {
  const endpoint = String(env.OPDF_S3_ENDPOINT || "").trim();
  if (!endpoint) return null;
  return createS3ObjectStore({
    endpoint,
    bucket: env.OPDF_S3_BUCKET,
    region: env.OPDF_S3_REGION || "us-east-1",
    accessKeyId: env.OPDF_S3_ACCESS_KEY_ID,
    secretAccessKey: env.OPDF_S3_SECRET_ACCESS_KEY,
    prefix: env.OPDF_S3_PREFIX || "opdf",
    pathStyle: env.OPDF_S3_PATH_STYLE !== "0",
  });
}
