import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgentPairingBroker } from "../../server/tpdf-agent-pairing.mjs";

function fixture() {
  let clock = 10_000;
  const broker = createAgentPairingBroker("agent-presence-test-secret-long-enough-1234", {
    now: () => clock, presenceTtlMs: 20_000,
  });
  const user = { id: "user-1" };
  const project = "project-1";
  const pair = broker.startPairing(user, project);
  const agent = broker.claimPairing(pair.code, { name: "worker" }).agent;
  return { broker, user, project, agent, advance: (ms) => { clock += ms; } };
}

test("pairing is not presence; tasks require a live worker", () => {
  const { broker, user, project, agent } = fixture();
  assert.equal(broker.listAgents(user, project)[0].online, false);
  assert.equal(broker.createTask(user, project, { query: "task" }), null);
  assert.equal(broker.heartbeatAgent(agent), true);
  assert.equal(broker.listAgents(user, project)[0].online, true);
  assert.ok(broker.createTask(user, project, { query: "task" }));
});

test("worker becomes offline after heartbeat expires, returns online after heartbeat", () => {
  const { broker, user, project, agent, advance } = fixture();
  broker.heartbeatAgent(agent);
  advance(20_001);
  assert.equal(broker.listAgents(user, project)[0].online, false);
  assert.equal(broker.createTask(user, project, { query: "task" }), null);
  broker.heartbeatAgent(agent);
  assert.equal(broker.listAgents(user, project)[0].online, true);
});

test("worker nextTask polling also refreshes presence", () => {
  const { broker, user, project, agent, advance } = fixture();
  assert.equal(broker.nextTask(agent), null);
  advance(19_000);
  assert.equal(broker.listAgents(user, project)[0].online, true);
  assert.equal(broker.nextTask(agent), null);
  advance(19_000);
  assert.equal(broker.listAgents(user, project)[0].online, true);
});
