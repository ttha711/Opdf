#!/usr/bin/env node
// Worker lives on the user's machine. It never evaluates model-produced shell commands.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const base = (process.env.TPDF_SERVER_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const dify = (process.env.TPDF_DIFY_URL || "").replace(/\/$/, "");
const key = process.env.TPDF_DIFY_API_KEY || "";
const tokenPath = resolve(process.env.TPDF_AGENT_TOKEN_FILE || homedir() + "/.tpdf/agent.json");
const command = process.argv[2];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function request(url, opts = {}) {
  const response = await fetch(url, { ...opts, signal: AbortSignal.timeout(60_000) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("HTTP " + response.status + ": " + JSON.stringify(value).slice(0, 500));
  return value;
}
async function saveToken(token) {
  await mkdir(dirname(tokenPath), { recursive: true, mode: 0o700 });
  await writeFile(tokenPath, JSON.stringify({ token, base }), { mode: 0o600 });
}
async function getToken() {
  const saved = JSON.parse(await readFile(tokenPath, "utf8"));
  if (saved.base !== base) throw new Error("Saved agent pairing belongs to another server.");
  return saved.token;
}
async function askModel(prompt) {
  if (!dify || !key) throw new Error("Set TPDF_DIFY_URL and TPDF_DIFY_API_KEY for the worker.");
  // A Dify Chatflow application must be configured to return a single JSON decision.
  const reply = await request(dify + "/chat-messages", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      inputs: {}, query: prompt, user: "tpdf-agent-" + randomUUID(),
      response_mode: "blocking",
    }),
  });
  const answer = typeof reply.answer === "string" ? reply.answer : "";
  if (!answer) throw new Error("Dify returned an empty model decision.");
  return { answer };
}
async function work() {
  const token = await getToken();
  process.stdout.write("TPDF model worker ready (tool execution remains in authenticated browser).\n");
  const heartbeat = () => request(base + "/api/tpdf/agent/heartbeat", {
    method: "POST", headers: { Authorization: "Bearer " + token },
  }).catch((error) => console.error("Heartbeat:", String(error)));
  await heartbeat();
  const heartbeatTimer = setInterval(() => { void heartbeat(); }, 8_000);
  heartbeatTimer.unref?.();
  while (true) {
    try {
      const next = await request(base + "/api/tpdf/agent/tasks/next", {
        headers: { Authorization: "Bearer " + token },
      });
      if (!next.task) { await sleep(1250); continue; }
      const { id, query, leaseToken } = next.task;
      let leaseLost = false;
      const renew = async () => {
        try {
          await request(base + "/api/tpdf/agent/tasks/" + id + "/renew", {
            method: "POST",
            headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ leaseToken }),
          });
        } catch (error) {
          leaseLost = true;
          console.error("Task lease lost:", String(error));
        }
      };
      const renewTimer = setInterval(() => { void renew(); }, 10_000);
      renewTimer.unref?.();
      let result;
      try {
        result = await askModel(String(query || ""));
      } catch (error) {
        result = { error: String(error) };
      }
      clearInterval(renewTimer);
      if (leaseLost) continue;
      await request(base + "/api/tpdf/agent/tasks/" + id + "/result", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(result.error ? { error: result.error, leaseToken } : { result, leaseToken }),
      });
    } catch (error) {
      console.error("Worker retry:", String(error));
      await sleep(2500);
    }
  }
}
if (command === "pair") {
  const code = process.argv[3];
  if (!code) throw new Error("Usage: node scripts/tpdf-agent-worker.mjs pair <PAIRING_CODE>");
  const value = await request(base + "/api/tpdf/agent/pairing/claim", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, machine: { machineId: randomUUID(), name: "TPDF Dify Model Worker", version: "2" } }),
  });
  await saveToken(value.token);
  process.stdout.write("Machine paired successfully.\n");
} else if (command === "start") {
  await work();
} else {
  process.stdout.write("Usage: node scripts/tpdf-agent-worker.mjs pair <CODE> | start\n");
  process.exitCode = 2;
}
