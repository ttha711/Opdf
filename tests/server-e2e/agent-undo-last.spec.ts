import { expect, test } from "@playwright/test";
import { LastPdfActionUndo } from "../../apps/web/src/agent/lastPdfActionUndo";
import type { AgentCommand, AgentCommandResult } from "../../apps/web/src/agent/types";

const snapshot = (text: string) => ({
  fileName: "example.pdf", sourceIdentity: "local", page: 1,
  bytes: new TextEncoder().encode(text), annotations: [],
});

test("undo restores only last completed AI edit, once", async () => {
  const undo = new LastPdfActionUndo();
  let value = "original";
  const capture = async () => snapshot(value);
  const restore = async (state: ReturnType<typeof snapshot>) => { value = new TextDecoder().decode(state.bytes); };
  const execute = async (command: AgentCommand): Promise<AgentCommandResult> => {
    value += command.tool;
    return { status: "completed", message: "ok" };
  };
  await undo.execute({ tool: "page-numbers" }, execute, capture, restore);
  await undo.execute({ tool: "watermark-pdf" }, execute, capture, restore);
  expect(value).toBe("originalpage-numberswatermark-pdf");
  const result = await undo.execute({ tool: "undo-last-agent-action" }, execute, capture, restore);
  expect(result.status).toBe("completed");
  expect(value).toBe("originalpage-numbers");
  expect((await undo.execute({ tool: "undo-last-agent-action" }, execute, capture, restore)).status).toBe("input_required");
});

test("refuses undo when another edit modified document", async () => {
  const undo = new LastPdfActionUndo();
  let value = "before";
  const capture = async () => snapshot(value);
  await undo.execute({ tool: "page-numbers" }, async () => {
    value = "after";
    return { status: "completed", message: "ok" };
  }, capture, async () => { throw new Error("Must not restore"); });
  value = "user-edited";
  const result = await undo.execute({ tool: "undo-last-agent-action" }, async () => {
    throw new Error("Must not execute");
  }, capture, async () => { throw new Error("Must not restore"); });
  expect(result.status).toBe("failed");
});
