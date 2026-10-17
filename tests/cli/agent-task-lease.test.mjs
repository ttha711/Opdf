import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgentPairingBroker } from "../../server/tpdf-agent-pairing.mjs";

function setup() {
  let time = 1000;
  const broker = createAgentPairingBroker("agent-task-lease-test-secret-1234567890", {
    now: () => time, leaseTtlMs: 30_000, maxAttempts: 2, presenceTtlMs: 90_000,
  });
  const user = { id: "user" }, project = "project";
  const pair = broker.startPairing(user, project);
  const worker = broker.claimPairing(pair.code).agent;
  broker.heartbeatAgent(worker);
  return { broker, worker, user, project, advance: (ms) => { time += ms; } };
}

test("orphaned task returns to queue with new lease; stale result is fenced", () => {
  const x = setup();
  const job = x.broker.createTask(x.user, x.project, { query: "hello" });
  const first = x.broker.nextTask(x.worker);
  assert.equal(first.id, job.id);
  x.advance(30_001);
  const second = x.broker.nextTask(x.worker);
  assert.equal(second.id, first.id);
  assert.notEqual(second.leaseToken, first.leaseToken);
  assert.equal(x.broker.completeTask(x.worker, first.id, { leaseToken: first.leaseToken, result: "stale" }), null);
  assert.equal(x.broker.completeTask(x.worker, second.id, { leaseToken: second.leaseToken, result: "ok" }).status, "completed");
  assert.equal(x.broker.getTask(x.user, x.project, job.id).result, "ok");
});

test("renewal extends lease for a slow model invocation", () => {
  const x = setup();
  x.broker.createTask(x.user, x.project, { query: "slow" });
  const claimed = x.broker.nextTask(x.worker);
  x.advance(20_000);
  assert.ok(x.broker.renewTask(x.worker, claimed.id, claimed.leaseToken));
  x.advance(20_000);
  assert.equal(x.broker.completeTask(x.worker, claimed.id, { leaseToken: claimed.leaseToken, result: "done" }).status, "completed");
});

test("retry limit fails orphaned task instead of repeating forever", () => {
  const x = setup();
  const job = x.broker.createTask(x.user, x.project, { query: "fail" });
  x.broker.nextTask(x.worker);
  x.advance(30_001);
  x.broker.nextTask(x.worker);
  x.advance(30_001);
  assert.equal(x.broker.getTask(x.user, x.project, job.id).status, "failed");
  assert.equal(x.broker.nextTask(x.worker), null);
});

test("cancelled task cannot be renewed or completed after cancellation", () => {
  const x = setup();
  const job = x.broker.createTask(x.user, x.project, { query: "cancel" });
  const claimed = x.broker.nextTask(x.worker);
  x.broker.cancelTask(x.user, x.project, job.id);
  assert.equal(x.broker.renewTask(x.worker, job.id, claimed.leaseToken), null);
  assert.equal(x.broker.completeTask(x.worker, job.id, { leaseToken: claimed.leaseToken, result: "late" }), null);
});
