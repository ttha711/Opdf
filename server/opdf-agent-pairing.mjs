import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

function encode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createAgentPairingBroker(secret, options = {}) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("Agent pairing requires a secret of at least 32 characters.");
  }

  const pairingTtlMs = Number(options.pairingTtlMs || 5 * 60 * 1000);
  const tokenTtlMs = Number(options.tokenTtlMs || 30 * 24 * 60 * 60 * 1000);
  const taskTtlMs = Number(options.taskTtlMs || 5 * 60 * 1000);
  const pairings = new Map();
  const agents = new Map();
  const tasks = new Map();

  const sign = (payload) => createHmac("sha256", secret).update(payload).digest("base64url");

  function issueAgentToken(agent) {
    const payload = encode({
      type: "opdf-machine-agent",
      agentId: agent.id,
      userId: agent.userId,
      projectId: agent.projectId,
      exp: Date.now() + tokenTtlMs,
    });
    return `${payload}.${sign(payload)}`;
  }

  function verifyAgentToken(token) {
    if (typeof token !== "string") return null;
    const [payload, signature] = token.split(".");
    if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (parsed?.type !== "opdf-machine-agent" || parsed.exp <= Date.now()) return null;
      const agent = agents.get(parsed.agentId);
      return agent && agent.userId === parsed.userId && agent.projectId === parsed.projectId ? agent : null;
    } catch {
      return null;
    }
  }

  function cleanup() {
    const now = Date.now();
    for (const [id, row] of pairings) if (row.expiresAt <= now || row.claimedAt) pairings.delete(id);
    for (const [id, row] of tasks) if (row.expiresAt <= now) tasks.delete(id);
  }

  function startPairing(user, projectId) {
    cleanup();
    const id = randomUUID();
    const code = randomBytes(5).toString("hex").toUpperCase();
    const row = {
      id,
      code,
      userId: user.id,
      projectId,
      createdAt: Date.now(),
      expiresAt: Date.now() + pairingTtlMs,
      claimedAt: null,
    };
    pairings.set(id, row);
    return { pairingId: id, code, expiresAt: row.expiresAt };
  }

  function claimPairing(code, machine = {}) {
    cleanup();
    const normalized = String(code || "").trim().toUpperCase();
    const pairing = [...pairings.values()].find((row) => row.code === normalized && !row.claimedAt);
    if (!pairing) return null;
    pairing.claimedAt = Date.now();
    const agent = {
      id: randomUUID(),
      userId: pairing.userId,
      projectId: pairing.projectId,
      machineId: String(machine.machineId || "").slice(0, 160),
      name: String(machine.name || "Local Machine Agent").slice(0, 160),
      version: String(machine.version || "").slice(0, 80),
      pairedAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    agents.set(agent.id, agent);
    return { agent, token: issueAgentToken(agent) };
  }

  function listAgents(user, projectId) {
    cleanup();
    return [...agents.values()]
      .filter((agent) => agent.userId === user.id && agent.projectId === projectId)
      .map(({ id, name, machineId, version, pairedAt, lastSeenAt }) => ({
        id, name, machineId, version, pairedAt, lastSeenAt,
      }));
  }

  function createTask(user, projectId, payload) {
    cleanup();
    const available = [...agents.values()].some(
      (agent) => agent.userId === user.id && agent.projectId === projectId,
    );
    if (!available) return null;
    const id = randomUUID();
    const task = {
      id,
      userId: user.id,
      projectId,
      status: "queued",
      query: String(payload.query || "").slice(0, 20000),
      context: payload.context && typeof payload.context === "object" ? payload.context : {},
      createdAt: Date.now(),
      expiresAt: Date.now() + taskTtlMs,
      claimedBy: null,
      result: null,
      error: null,
    };
    tasks.set(id, task);
    return { id, status: task.status, createdAt: task.createdAt };
  }

  function nextTask(agent) {
    cleanup();
    agent.lastSeenAt = Date.now();
    const task = [...tasks.values()].find(
      (row) => row.userId === agent.userId &&
        row.projectId === agent.projectId &&
        row.status === "queued",
    );
    if (!task) return null;
    task.status = "running";
    task.claimedBy = agent.id;
    return { id: task.id, query: task.query, context: task.context, createdAt: task.createdAt };
  }

  function completeTask(agent, taskId, payload) {
    cleanup();
    const task = tasks.get(taskId);
    if (!task || task.userId !== agent.userId || task.projectId !== agent.projectId) return null;
    if (task.claimedBy && task.claimedBy !== agent.id) return null;
    task.status = payload?.error ? "failed" : "completed";
    task.result = payload?.result ?? payload?.answer ?? null;
    task.error = payload?.error ? String(payload.error).slice(0, 4000) : null;
    task.completedAt = Date.now();
    agent.lastSeenAt = Date.now();
    return { id: task.id, status: task.status };
  }

  function getTask(user, projectId, taskId) {
    cleanup();
    const task = tasks.get(taskId);
    if (!task || task.userId !== user.id || task.projectId !== projectId) return null;
    return {
      id: task.id,
      status: task.status,
      result: task.result,
      error: task.error,
      createdAt: task.createdAt,
      completedAt: task.completedAt ?? null,
    };
  }

  return {
    startPairing,
    claimPairing,
    verifyAgentToken,
    listAgents,
    createTask,
    nextTask,
    completeTask,
    getTask,
  };
}
