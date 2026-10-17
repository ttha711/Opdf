import { expect, test } from "@playwright/test";
import { runAgentHarness } from "../../apps/web/src/agent/harness";
import type { AgentToolDefinition } from "../../apps/web/src/agent/types";

const tools = [
  { id: "rotate-all-left", title: "Rotate pages left", description: "Rotate every page left", risk: "safe", requiresDocument: true },
] as AgentToolDefinition[];

test("tool discovery feeds returned capability schema into next model call", async () => {
  const prompts: string[] = [];
  const responses = [
    { action: "discover", query: "rotate pages left" },
    { action: "execute", tool: "rotate-all-left" },
    { action: "finish", message: "Rotated pages" },
  ];
  const calls: string[] = [];
  const outcome = await runAgentHarness(
    { goal: "Rotate the current document", observations: [] },
    {
      model: async (prompt) => { prompts.push(prompt); return responses.shift(); },
      execute: async (cmd) => {
        calls.push(cmd.tool);
        return { status: "completed", message: "Rotated", tool: cmd.tool };
      },
      listTools: () => tools,
      getState: () => ({ hasDocument: true }),
    },
  );
  expect(outcome.status).toBe("completed");
  expect(JSON.parse(prompts[1]).discoveredTools).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "rotate-all-left" }),
  ]));
  expect(calls).toEqual(["rotate-all-left"]);
});

test("agent cannot report an executed action without an observed tool result", async () => {
  const outcome = await runAgentHarness(
    { goal: "Delete a page", observations: [] },
    {
      model: async () => ({ action: "finish", message: "Deleted page successfully" }),
      execute: async () => { throw new Error("No tool should execute"); },
      listTools: () => tools,
      getState: () => ({ hasDocument: true }),
    },
  );
  expect(outcome.status).toBe("failed");
});
