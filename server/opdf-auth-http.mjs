import { AuthError, bearerToken, normalizeTenantId } from "./opdf-auth.mjs";

function secureCookie(req) {
  return req.socket?.encrypted || String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "https";
}

function cookie(name, value, req, maxAge = null) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (secureCookie(req)) parts.push("Secure");
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}

export function createAuthHttp({
  auth,
  tenantManager,
  sendJson,
  sendError,
  readJsonBody,
}) {
  async function handlePublic(req, res, url) {
    if (url.pathname !== "/api/opdf/auth/session") return false;
    if (auth.mode !== "token") {
      return sendError(res, 404, "Token sessions are not enabled.");
    }

    if (req.method === "DELETE") {
      res.setHeader("Set-Cookie", [
        cookie("opdf_session", "", req, 0),
        cookie("opdf_project", "", req, 0),
      ]);
      return sendJson(res, 200, { authenticated: false });
    }

    if (req.method !== "POST") return sendError(res, 405, "Method not allowed.");
    const token = bearerToken(req);
    if (!token) return sendError(res, 400, "Bearer token is required to establish a session.");
    const loginUrl = new URL(url);
    loginUrl.searchParams.set("project", "default");
    const context = auth.authenticate(req, loginUrl);
    res.setHeader("Set-Cookie", [
      cookie("opdf_session", token, req, 7 * 24 * 60 * 60),
      cookie("opdf_project", "default", req, 365 * 24 * 60 * 60),
    ]);
    return sendJson(res, 200, {
      authenticated: true,
      mode: context.mode,
      userId: context.userId,
      displayName: context.displayName,
      projectId: context.projectId,
      quotaBytes: context.quotaBytes,
    });
  }

  async function handleAuthenticated(req, res, url, context) {
    if (url.pathname === "/api/opdf/auth/me") {
      if (req.method !== "GET") return sendError(res, 405, "Method not allowed.");
      return sendJson(res, 200, {
        authenticated: true,
        mode: context.mode,
        userId: context.userId,
        displayName: context.displayName,
        email: context.email || null,
        projectId: context.projectId,
        quotaBytes: context.quotaBytes,
        usageBytes: await tenantManager.usage(context),
      });
    }

    if (url.pathname === "/api/opdf/projects") {
      if (req.method === "GET") {
        return sendJson(res, 200, await tenantManager.listProjects(context));
      }
      if (req.method === "POST") {
        const body = await readJsonBody(req, 64 * 1024);
        const created = await tenantManager.createProject(context, body.id);
        return sendJson(res, 201, created);
      }
      return sendError(res, 405, "Method not allowed.");
    }

    if (url.pathname === "/api/opdf/projects/select") {
      if (req.method !== "POST") return sendError(res, 405, "Method not allowed.");
      const body = await readJsonBody(req, 64 * 1024);
      const id = normalizeTenantId(body.id, "");
      if (!id) return sendError(res, 400, "A valid project id is required.");
      if (context.projects && !context.projects.includes(id)) {
        throw new AuthError(403, "This user is not authorized for that project.");
      }
      await tenantManager.createProject(context, id);
      res.setHeader("Set-Cookie", cookie("opdf_project", id, req, 365 * 24 * 60 * 60));
      return sendJson(res, 200, { id });
    }

    return false;
  }

  function serveLogin(res) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(`<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>OPDF Sign in</title></head>
<body style="font-family:system-ui;max-width:440px;margin:10vh auto;padding:24px">
<h1 style="font-size:22px">OPDF Server</h1>
<p>Enter your access token to start a secure browser session.</p>
<form id="f">
<input id="t" type="password" autocomplete="current-password" style="width:100%;padding:10px;box-sizing:border-box" placeholder="Access token">
<button style="margin-top:12px;padding:10px 16px" type="submit">Sign in</button>
<div id="e" style="color:#b91c1c;margin-top:10px"></div>
</form>
<script>
document.getElementById("f").addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = document.getElementById("t").value;
  const response = await fetch("/api/opdf/auth/session", {
    method: "POST",
    headers: { Authorization: "Bearer " + token }
  });
  if (response.ok) location.reload();
  else document.getElementById("e").textContent = (await response.json()).error || "Sign in failed.";
});
</script></body></html>`);
  }

  return { handlePublic, handleAuthenticated, serveLogin };
}
