import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgentPairingBroker } from "../../server/tpdf-agent-pairing.mjs";

const makeBroker = () => createAgentPairingBroker("agent-cancel-test-secret-32-characters-minimum");

function fixture() {
  const broker = makeBroker();
  const user = { id: "user-a" }, project = "project-a";
  const pairing = broker.startPairing(user, project);
  const claimed = broker.claimPairing(pairing.code, { name: "Test Worker" });
  return { broker, user, project, agent: claimed.agent };
}

test("cancel queued task prevents machine pickup and does not impact another task", () => {
  const { broker, user, project, agent } = fixture();
  const one = broker.createTask(user, project, { query: "first" });
  const two = broker.createTask(user, project, { query: "second" });
  assert.equal(broker.cancelTask(user, project, one.id).status, "cancelled");
  assert.equal(broker.nextTask(agent).id, two.id);
  assert.equal(broker.getTask(user, project, one.id).status, "cancelled");
});

test("cancel running task rejects late result and other tenant cannot cancel", () => {
  const { broker, user, project, agent } = fixture();
  const job = broker.createTask(user, project, { query: "run" });
  assert.equal(broker.nextTask(agent).id, job.id);
  assert.equal(broker.cancelTask({ id: "outsider" }, project, job.id), null);
  assert.equal(broker.cancelTask(user, "other-project", job.id), null);
  assert.equal(broker.cancelTask(user, project, job.id).status, "cancelled");
  assert.equal(broker.completeTask(agent, job.id, { answer: "late success" }), null);
  assert.equal(broker.getTask(user, project, job.id).result, null);
});

test("only claiming worker can complete running task", () => {
  const { broker, user, project, agent } = fixture();
  const pairing2 = broker.startPairing(user, project);
  const another = broker.claimPairing(pairing2.code, { name: "Other Worker" }).agent;
  const job = broker.createTask(user, project, { query: "work" });
  assert.equal(broker.completeTask(agent, job.id, { answer: "not claimed" }), null);
  assert.equal(broker.nextTask(agent).id, job.id);
  assert.equal(broker.completeTask(another, job.id, { answer: "wrong worker" }), null);
  assert.equal(broker.completeTask(agent, job.id, { answer: "correct" }).status, "completed");
});
