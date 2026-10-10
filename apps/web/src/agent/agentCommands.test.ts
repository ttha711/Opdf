import { describe, expect, it, vi } from "vitest";
import {
  AGENT_TOOL_DEFINITIONS,
  createAgentCommandQueue,
  executeAgentCommand,
  getAgentToolDefinition,
  type AgentActionContext,
} from "./agentCommands";

function createContext(overrides: Partial<Parameters<typeof executeAgentCommand>[1]> = {}) {
  const calls: string[] = [];
  const context: AgentActionContext & { calls: string[] } = {
    state: {
      hasDocument: true,
      fileName: "sample.pdf",
      currentPage: 2,
      totalPages: 5,
      activeTool: "select",
      viewMode: "continuous",
      hasDesktopBridge: false,
    },
    actions: {
      compressDocument: vi.fn(async () => { calls.push("compress"); }),
      runDocumentTool: vi.fn(async (tool: any) => { calls.push(`document:${tool}`); }),
      runConfiguredDocumentTool: vi.fn(async (tool: any) => { calls.push(`configured-document:${tool}`); }),
      runConfiguredMarkupTool: vi.fn(async (tool: any) => { calls.push(`markup:${tool}`); }),
      runConfiguredWatermark: vi.fn(async () => { calls.push("watermark"); }),
      setPage: vi.fn((page: number) => { calls.push(`page:${page}`); }),
      setViewMode: vi.fn((mode: any) => { calls.push(`view:${mode}`); }),
      setActiveTool: vi.fn((tool: any) => { calls.push(`active:${tool}`); }),
      setActiveDashboardTool: vi.fn((tool: string | null) => { calls.push(`panel:${tool}`); }),
      openRightSidebar: vi.fn(() => { calls.push("sidebar:open"); }),
      setShowDashboard: vi.fn((show: boolean) => { calls.push(`dashboard:${show}`); }),
      setViewerError: vi.fn(),
    },
    calls,
    ...overrides,
  };
  return context;
}

describe("agent command registry", () => {
  it("describes the broad app tool surface for LLM function calling", () => {
    expect(AGENT_TOOL_DEFINITIONS.length).toBeGreaterThanOrEqual(59);
    expect(getAgentToolDefinition("compress-pdf")?.risk).toBe("safe");
    expect(getAgentToolDefinition("normalize")?.documentTool).toBe("normalize");
    expect(getAgentToolDefinition("delete-pages")?.risk).toBe("destructive");
    expect(getAgentToolDefinition("watermark-pdf")?.requiredArgs).toContain("text");
  });

  it("asks for missing advanced options before executing", async () => {
    const result = await executeAgentCommand({ tool: "watermark-pdf" }, createContext());

    expect(result.status).toBe("input_required");
    expect(result.missingArgs).toEqual(["text"]);
  });

  it("asks for confirmation before destructive commands", async () => {
    const ctx = createContext();
    const result = await executeAgentCommand({ tool: "delete-pages", args: { pages: "2" } }, ctx);

    expect(result.status).toBe("confirmation_required");
    expect(ctx.actions.runConfiguredDocumentTool).not.toHaveBeenCalled();
  });

  it("runs safe commands immediately when state and arguments are sufficient", async () => {
    const ctx = createContext();
    const result = await executeAgentCommand({ tool: "compress-pdf" }, ctx);

    expect(result.status).toBe("completed");
    expect(ctx.actions.compressDocument).toHaveBeenCalledTimes(1);
  });

  it("passes complete destructive commands to the headless document action after confirmation", async () => {
    const ctx = createContext();
    const result = await executeAgentCommand({ tool: "delete-pages", args: { pages: "2,4" }, confirmed: true }, ctx);

    expect(result.status).toBe("completed");
    expect(ctx.actions.runConfiguredDocumentTool).toHaveBeenCalledWith("delete-pages", { pages: "2,4" });
  });

  it("runs watermark directly when the required text is present", async () => {
    const ctx = createContext();
    const result = await executeAgentCommand({ tool: "watermark-pdf", args: { text: "DRAFT" } }, ctx);

    expect(result.status).toBe("completed");
    expect(ctx.actions.runConfiguredWatermark).toHaveBeenCalledWith({ text: "DRAFT" });
  });

  it("opens the right sidebar when an agent opens a tool panel", async () => {
    const ctx = createContext();
    const result = await executeAgentCommand({
      tool: "open-tool-panel",
      args: { toolId: "watermark-pdf" },
    }, ctx);

    expect(result.status).toBe("completed");
    expect(ctx.actions.setActiveDashboardTool).toHaveBeenCalledWith("watermark-pdf");
    expect(ctx.actions.openRightSidebar).toHaveBeenCalledTimes(1);
  });

  it("uses headless conversion for PDF page image exports", async () => {
    const runHeadlessConversion = vi.fn(async () => ({ message: "Exported images." }));
    const ctx = createContext({
      actions: {
        ...createContext().actions,
        runHeadlessConversion,
      },
    });
    const result = await executeAgentCommand({ tool: "pdf-to-jpeg" }, ctx);

    expect(result.status).toBe("completed");
    expect(runHeadlessConversion).toHaveBeenCalledWith("pdf-to-jpeg", {});
    expect(ctx.actions.setActiveDashboardTool).not.toHaveBeenCalled();
  });

  it("serializes commands through a queue", async () => {
    const order: string[] = [];
    const queue = createAgentCommandQueue(async (command) => {
      order.push(`start:${command.tool}`);
      await new Promise((resolve) => setTimeout(resolve, command.tool === "compress-pdf" ? 15 : 0));
      order.push(`end:${command.tool}`);
      return { status: "completed", message: command.tool };
    });

    await Promise.all([
      queue.enqueue({ tool: "compress-pdf" }),
      queue.enqueue({ tool: "rotate-all-right" }),
    ]);

    expect(order).toEqual([
      "start:compress-pdf",
      "end:compress-pdf",
      "start:rotate-all-right",
      "end:rotate-all-right",
    ]);
  });
});
