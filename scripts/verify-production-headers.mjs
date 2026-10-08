// Verify what a real HTTPS client receives after any CDN/proxy transforms.
const target = process.argv[2] || process.env.TARGET_URL;
if (!target) throw new Error("Usage: node scripts/verify-production-headers.mjs https://opdf.example/");
const url = new URL(target);
if (url.protocol !== "https:") throw new Error("Production header audit requires an HTTPS URL.");

const headers = {};
const clientId = process.env.OPDF_CF_ACCESS_CLIENT_ID;
const clientSecret = process.env.OPDF_CF_ACCESS_CLIENT_SECRET;
if (clientId && clientSecret) {
  headers["CF-Access-Client-Id"] = clientId;
  headers["CF-Access-Client-Secret"] = clientSecret;
}

const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
const html = await response.text();
function check(condition, message) {
  if (!condition) throw new Error("Production security header audit failed: " + message);
}

check(response.ok, "HTTP " + response.status + " from " + url.origin);
check(new URL(response.url).origin === url.origin, "unexpected redirect: " + response.url);
check((response.headers.get("content-type") || "").includes("text/html"), "expected HTML");
const hsts = response.headers.get("strict-transport-security") || "";
const maxAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] || 0);
check(maxAge >= 31_536_000, "HSTS max-age must be at least 31536000");
check(/includesubdomains/i.test(hsts), "HSTS includeSubDomains missing");
check(response.headers.get("x-frame-options") === "DENY", "X-Frame-Options missing");
check(response.headers.get("x-content-type-options") === "nosniff", "X-Content-Type-Options missing");
check(response.headers.get("referrer-policy") === "same-origin", "Referrer-Policy missing");
check((response.headers.get("permissions-policy") || "").includes("microphone=()"),
  "Permissions-Policy missing");

const csp = response.headers.get("content-security-policy") || "";
for (const directive of ["object-src 'none'", "frame-ancestors 'none'", "wasm-unsafe-eval", "worker-src 'self' blob:"]) {
  check(csp.includes(directive), "CSP missing " + directive);
}
const script = csp.split(";").map((part) => part.trim())
  .find((part) => part.startsWith("script-src ")) || "";
check(!script.includes(" *") && !script.includes(" https:") && !script.includes("'unsafe-inline'"),
  "script-src has a broad script allowance");
if (html.includes("static.cloudflareinsights.com/beacon.min.js")) {
  check(script.includes("https://static.cloudflareinsights.com/beacon.min.js"),
    "Cloudflare-injected beacon is blocked by CSP; enable OPDF_CLOUDFLARE_INSIGHTS=1 or disable injection");
}

console.log("OPDF production security headers passed:", url.origin);
