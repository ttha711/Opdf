import { applyProductionSecurityHeaders } from "./opdf-production-guard.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function headersFor(config) {
  const headers = new Map();
  applyProductionSecurityHeaders({
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
  }, config);
  return headers;
}

const defaultHeaders = headersFor({});
assert(!defaultHeaders.has("strict-transport-security"), "HSTS must remain opt-in for unknown HTTP origins");
assert(!defaultHeaders.get("content-security-policy").includes("cloudflareinsights.com"),
  "Analytics must remain blocked by default");
const publicHttpsHeaders = headersFor({ OPDF_PUBLIC_ORIGIN: "https://pdf.example.com" });
assert(publicHttpsHeaders.get("strict-transport-security") === "max-age=31536000; includeSubDomains",
  "HTTPS public origin must enable HSTS");
assert(!headersFor({ OPDF_PUBLIC_ORIGIN: "https://pdf.example.com", OPDF_HSTS: "0" })
  .has("strict-transport-security"), "Explicit HSTS opt-out must work");
assert(headersFor({ OPDF_HSTS: "1" }).has("strict-transport-security"),
  "Explicit HSTS opt-in must work");
const insightsHeaders = headersFor({ OPDF_CLOUDFLARE_INSIGHTS: "1" });
const insightsCsp = insightsHeaders.get("content-security-policy");
assert(insightsCsp.includes("script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com/beacon.min.js https://static.cloudflareinsights.com/beacon.min.js/"),
  "Cloudflare analytics opt-in must allow the exact and versioned beacon paths");
assert(!insightsCsp.includes("script-src *") && !insightsCsp.includes("script-src https:"),
  "Cloudflare analytics may not broadly relax script-src");

