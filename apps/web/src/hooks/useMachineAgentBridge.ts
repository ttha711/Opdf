import { useCallback, useEffect, useState } from "react";

type AgentSummary = {
  id: string;
  name: string;
  machineId: string;
  version: string;
  pairedAt: number;
  lastSeenAt: number;
};

type Pairing = {
  pairingId: string;
  code: string;
  expiresAt: number;
};

type TaskState = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string | null;
};

const isServerRuntime = () =>
  typeof window !== "undefined" && window.__OPDF_RUNTIME__ === "server";

export function useMachineAgentBridge() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!isServerRuntime()) return;
    try {
      const response = await fetch("/api/opdf/agent/status", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Agent status failed: HTTP ${response.status}`);
      const payload = await response.json() as { agents?: AgentSummary[] };
      setAgents(Array.isArray(payload.agents) ? payload.agents : []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load machine agent status.");
    }
  }, []);

  useEffect(() => {
    if (!isServerRuntime()) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const startPairing = useCallback(async () => {
    if (!isServerRuntime()) return null;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/opdf/agent/pairing/start", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error(`Unable to start pairing: HTTP ${response.status}`);
      const payload = await response.json() as Pairing;
      setPairing(payload);
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start pairing.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const sendQuery = useCallback(async (query: string, context: Record<string, unknown>) => {
    if (!isServerRuntime()) throw new Error("Machine Agent Bridge is available on OPDF Server.");
    const response = await fetch("/api/opdf/agent/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, context }),
    });
    if (response.status === 409) {
      throw new Error("No paired machine agent is online. Open AI settings and pair your machine first.");
    }
    if (!response.ok) throw new Error(`Machine Agent request failed: HTTP ${response.status}`);
    const task = await response.json() as { id: string };

    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 600));
      const poll = await fetch(`/api/opdf/agent/tasks/${task.id}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!poll.ok) throw new Error(`Machine Agent task failed: HTTP ${poll.status}`);
      const state = await poll.json() as TaskState;
      if (state.status === "completed") {
        void refresh();
        return state.result;
      }
      if (state.status === "failed") {
        throw new Error(state.error || "Machine Agent task failed.");
      }
    }
    throw new Error("Machine Agent did not respond within 90 seconds.");
  }, [refresh]);

  return {
    isServerRuntime: isServerRuntime(),
    agents,
    connected: agents.length > 0,
    pairing,
    loading,
    error,
    refresh,
    startPairing,
    sendQuery,
  };
}
