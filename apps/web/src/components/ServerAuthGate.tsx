import { FormEvent, ReactNode, useEffect, useState } from "react";

type Session = {
  user: {
    id: string;
    email: string;
    role: "admin" | "user";
    quotaBytes: number;
  };
  projectId: string;
  quota: {
    usedBytes: number;
    quotaBytes: number;
    availableBytes: number;
    percentUsed: number;
  };
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount >= 100 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

export function ServerAuthGate({ children }: { children: ReactNode }) {
  const isServerRuntime =
    typeof window !== "undefined" && window.__OPDF_RUNTIME__ === "server";
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isServerRuntime);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function loadSession() {
    if (!isServerRuntime) return;
    const response = await fetch("/api/opdf/auth/me", { credentials: "same-origin" });
    if (response.status === 401) {
      setRequiresLogin(true);
      setSession(null);
      setReady(true);
      return;
    }
    if (!response.ok) throw new Error(`Unable to load OPDF session: HTTP ${response.status}`);
    setSession(await response.json() as Session);
    setRequiresLogin(false);
    setReady(true);
  }

  useEffect(() => {
    void loadSession().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "Unable to load OPDF session.");
      setReady(true);
    });
  }, [isServerRuntime]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/opdf/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Sign in failed.");
      }
      setPassword("");
      await loadSession();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setWorking(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--ui-bg)] text-sm text-[var(--text-secondary)]">
        Loading OPDF…
      </div>
    );
  }

  if (isServerRuntime && requiresLogin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--ui-bg)] p-6">
        <form
          onSubmit={submit}
          className="w-full max-w-sm rounded-xl border border-[var(--ui-border)] bg-[var(--panel-bg)] p-6 shadow-xl"
        >
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Sign in to OPDF</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Use the account configured by your OPDF administrator.
          </p>
          <label className="mt-5 block text-sm font-medium text-[var(--text-primary)]">
            Email
            <input
              required
              autoComplete="username"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2"
            />
          </label>
          <label className="mt-4 block text-sm font-medium text-[var(--text-primary)]">
            Password
            <input
              required
              minLength={12}
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2"
            />
          </label>
          {error ? (
            <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={working}
            className="mt-5 w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            {working ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      {isServerRuntime && session && Number.isFinite(session.quota.quotaBytes) &&
      session.quota.quotaBytes < Number.MAX_SAFE_INTEGER ? (
        <div
          data-opdf-server-user
          className="fixed bottom-7 right-3 z-[200] rounded-md border border-[var(--ui-border)] bg-[var(--panel-bg)] px-2 py-1 text-[10px] text-[var(--text-secondary)] shadow"
          title={`${session.user.email} · project ${session.projectId}`}
        >
          {session.user.email} · {formatBytes(session.quota.usedBytes)} / {formatBytes(session.quota.quotaBytes)}
        </div>
      ) : null}
      {children}
    </>
  );
}
