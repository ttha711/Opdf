type ClientErrorEvent = {
  kind: "window-error" | "unhandled-rejection" | "error-boundary";
  message: string;
  stack?: string;
  componentStack?: string;
  buildSha?: string;
};

function bounded(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export function reportClientError(event: ClientErrorEvent) {
  if (typeof window === "undefined" || window.__OPDF_RUNTIME__ !== "server") return;

  const baseUrl = window.__OPDF_SERVER_BASE__ || "/api/opdf";
  const payload = {
    kind: event.kind,
    message: bounded(event.message, 500),
    stack: bounded(event.stack, 4_000),
    componentStack: bounded(event.componentStack, 4_000),
    buildSha: bounded(event.buildSha, 128),
    path: window.location.pathname.slice(0, 500),
    occurredAt: new Date().toISOString(),
  };

  void fetch(`${baseUrl}/client-events`, {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Diagnostics must never create a secondary application failure.
  });
}

export function installGlobalErrorReporting(buildSha: string) {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    reportClientError({
      kind: "window-error",
      message: event.message || "Unhandled window error",
      stack: event.error instanceof Error ? event.error.stack : undefined,
      buildSha,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportClientError({
      kind: "unhandled-rejection",
      message: reason instanceof Error ? reason.message : String(reason ?? "Unhandled promise rejection"),
      stack: reason instanceof Error ? reason.stack : undefined,
      buildSha,
    });
  });
}
