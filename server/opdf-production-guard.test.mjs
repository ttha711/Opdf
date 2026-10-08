import assert from "node:assert/strict";
import test from "node:test";
import { applyProductionSecurityHeaders } from "./opdf-production-guard.mjs";

function headersFor(env) {
  const headers = new Map();
  applyProductionSecurityHeaders({
    setHeader(name, value) { headers.set(name.toLowerCase(), String(value)); },
  }, env);
  return headers;
}

test("HTTPS public origin enables HSTS by default", () => {
  const headers = headersFor({ OPDF_PUBLIC_ORIGIN: "https://pdf.example.test" });
  assert.equal(headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
});

test("HTTP development and explicit opt-out do not use HSTS", () => {
  assert.equal(headersFor({ OPDF_PUBLIC_ORIGIN: "http://localhost" }).has("strict-transport-security"), false);
  assert.equal(headersFor({ OPDF_PUBLIC_ORIGIN: "https://pdf.example.test", OPDF_HSTS: "0" }).has("strict-transport-security"), false);
});

test("Explicit HSTS works behind TLS-terminating reverse proxies", () => {
  assert.equal(headersFor({ OPDF_HSTS: "1" }).has("strict-transport-security"), true);
});

test("Cloudflare Insights script allowance is opt-in and exact", () => {
  const strict = headersFor({}).get("content-security-policy");
  const analytics = headersFor({ OPDF_CLOUDFLARE_INSIGHTS: "1" }).get("content-security-policy");
  assert.equal(strict.includes("static.cloudflareinsights.com"), false);
  assert.ok(analytics.includes("script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com"));
  assert.equal(analytics.includes("script-src 'self' 'wasm-unsafe-eval' https:"), true);
  assert.equal(analytics.includes("script-src *"), false);
});
