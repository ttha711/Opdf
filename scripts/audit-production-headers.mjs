#!/usr/bin/env node
// Verify the security headers the browser actually receives at the public HTTPS edge.
const target = new URL(process.argv[2] || process.env.TARGET_URL || "");
if (target.protocol !== "https:") throw new Error("Production header audit requires an HTTPS URL.");

const headers = {};
if (process.env.OPDF_CF_ACCESS_CLIENT_ID && process.env.OPDF_CF_ACCESS_CLIENT_SECRET) {
  headers["CF-Access-Client-Id"] = process.env.OPDF_CF_ACCESS_CLIENT_ID;
  headers["CF-Access-Client-Secret"] = process.env.OPDF_CF_ACCESS_CLIENT_SECRET;
}
const response = await fetch(target, { headers, redirect: "manual", signal: AbortSignal.timeout(20000) });
if (response.status !== 200) {
  throw new Error(`Production HTML returned HTTP ${response.status}; check deployed URL/access policy.`);
}
const header = (name) => response.headers.get(name) || "";
const hsts = header("strict-transport-security");
if (!/max-age=(\d+)/i.test(hsts) || Number(/max-age=(\d+)/i.exec(hsts)[1]) < 31536000) {
  throw new Error("Production HTTPS response is missing a >= 1-year HSTS max-age.");
}
for (const [name, expected] of [
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["referrer-policy", "same-origin"],
]) {
  if (header(name).toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Missing or unexpected ${name} security header.`);
  }
}
const csp = header("content-security-policy");
if (!csp.includes("default-src 'self'") || !csp.includes("object-src 'none'") ||
    !csp.includes("frame-ancestors 'none'") || !csp.includes("worker-src 'self' blob:")) {
  throw new Error("Expected restrictive OPDF Content-Security-Policy directives are missing.");
}
const html = await response.text();
if (/static\.cloudflareinsights\.com\//i.test(html)) {
  const scriptSrc = csp.split(";").map((v) => v.trim()).find((v) => v.startsWith("script-src ")) || "";
  if (!scriptSrc.includes("https://static.cloudflareinsights.com")) {
    throw new Error("Cloudflare Insights is injected but script-src blocks it. Disable injection or set OPDF_CLOUDFLARE_INSIGHTS=1 at the origin.");
  }
}
console.log("OPDF production HTTPS security headers passed.");
