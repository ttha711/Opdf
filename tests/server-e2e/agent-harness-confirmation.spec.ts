import { expect, test } from "@playwright/test";
import { runAgentHarness } from "../../apps/web/src/agent/harness";
import type { AgentToolDefinition } from "../../apps/web/src/agent/types";

const tools = [
  { id: "delete-pages", title: "Delete pages", description: "Delete PDF pages", risk: "destructive", requiresDocument: true, requiredArgs: ["pages"] },
  { id: "save-pdf", title: "Save", description: "Save PDF", risk: "safe", requiresDocument: true },
] as AgentToolDefinition[];

test("a destructive model action pauses inline; approval only replays exact pending action", async () => {
  const calls: Array<{ tool: string; confirmed: boolean; pages: unknown }> = [];
  const responses = [
    { action: "execute", tool: "delete-pages", args: { pages: "2" }, confirmed: true },
    { action: "execute", tool: "save-pdf", args: {} },
    { action: "finish", message: "Saved" },
  ];
  const adapter = {
    model: async () => responses.shift(),
    listTools: () => tools,
    getState: () => ({ hasDocument: true, totalPages: 5 }),
    execute: async (cmd: { tool: string; confirmed?: boolean; args?: Record<string, unknown> }) => {
      calls.push({ tool: cmd.tool, confirmed: cmd.confirmed === true, pages: cmd.args?.pages });
      if (cmd.tool === "delete-pages" && !cmd.confirmed) {
        return { status: "confirmation_required" as const, message: "Confirm delete", confirmationPrompt: "Delete page 2?" };
      }
      return { status: "completed" as const, message: "ok" };
    },
  };
  const first = await runAgentHarness({ goal: "Delete page 2 then save", observations: [] }, adapter);
  expect(first.status).toBe("confirmation_required");
  expect(first.checkpoint.pending?.args).toEqual({ pages: "2" });
  expect(calls).toEqual([{ tool: "delete-pages", confirmed: false, pages: "2" }]);

  const second = await runAgentHarness(first.checkpoint, adapter, "approve");
  expect(second.status).toBe("completed");
  expect(calls).toEqual([
    { tool: "delete-pages", confirmed: false, pages: "2" },
    { tool: "delete-pages", confirmed: true, pages: "2" },
    { tool: "save-pdf", confirmed: false, pages: undefined },
  ]);
});

test("rejecting inline action does not execute it", async () => {
  let calls = 0;
  const result = await runAgentHarness(
    { goal: "Delete page", observations: [], pending: { tool: "delete-pages", args: { pages: "1" } } },
    {
      model: async () => ({ action: "finish", message: "irrelevant" }),
      listTools: () => tools,
      getState: () => ({}),
      execute: async () => { calls += 1; return { status: "completed", message: "ok" }; },
    },
    "reject",
  );
  expect(result.status).toBe("failed");
  expect(calls).toBe(0);
});
