import { expect, test } from "@playwright/test";
import { executeAgentCommand } from "../../apps/web/src/agent/executor";
import { runAgentHarness } from "../../apps/web/src/agent/harness";
import type { AgentActionContext, AgentToolDefinition } from "../../apps/web/src/agent/types";

const state = (documentRevision: string): AgentActionContext["state"] => ({
  hasDocument: true,
  fileName: "drawing.pdf",
  documentRevision,
  currentPage: 1,
  totalPages: 5,
  activeTool: "select",
  viewMode: "continuous",
  hasDesktopBridge: false,
});

test("tool executor blocks stale document edits before changing PDF", async () => {
  let writes = 0;
  const context: AgentActionContext = {
    state: state("new-version"),
    actions: { runConfiguredDocumentTool: async () => { writes++; } },
  };
  const result = await executeAgentCommand(
    { tool: "delete-pages", args: { pages: "2" }, confirmed: true, expectedRevision: "old-version" },
    context,
  );
  expect(result.status).toBe("failed");
  expect(result.message).toContain("Document changed");
  expect(writes).toBe(0);
});

test("pending approval cannot execute after document changes", async () => {
  let version = "original";
  let writes = 0;
  const responses = [{ action: "execute", tool: "delete-pages", args: { pages: "2" } }];
  const ctx = (): AgentActionContext => ({
    state: state(version),
    actions: { runConfiguredDocumentTool: async () => { writes++; } },
  });
  const adapter = {
    model: async () => responses.shift(),
    execute: async (command: Parameters<typeof executeAgentCommand>[0]) => executeAgentCommand(command, ctx()),
    listTools: () => [{
      id: "delete-pages", title: "Delete pages", description: "Delete pages", risk: "destructive",
      requiresDocument: true, requiredArgs: ["pages"],
    }] as AgentToolDefinition[],
    getState: () => ({ hasDocument: true, documentRevision: version }),
  };
  const first = await runAgentHarness({ goal: "Delete page 2", observations: [] }, adapter);
  expect(first.status).toBe("confirmation_required");
  expect(first.checkpoint.pending?.expectedRevision).toBe("original");
  version = "new-document";
  const later = await runAgentHarness(first.checkpoint, adapter, "approve");
  expect(later.status).toBe("failed");
  expect(writes).toBe(0);
});

test("a still-current approval executes only once", async () => {
  let writes = 0;
  const context: AgentActionContext = {
    state: state("same"),
    actions: { runConfiguredDocumentTool: async () => { writes++; } },
  };
  const result = await executeAgentCommand(
    { tool: "delete-pages", args: { pages: "2" }, confirmed: true, expectedRevision: "same" },
    context,
  );
  expect(result.status).toBe("completed");
  expect(writes).toBe(1);
});
