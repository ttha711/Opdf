import { describe, expect, it } from "vitest";
import { AGENT_TOOL_DEFINITIONS } from "../agent/definitions";
import { ALL_TOOLS_CATALOG, isDashboardToolId } from "./allToolsCatalog";
import { PALETTE_COMMANDS } from "./commandPalette";

describe("canonical PDF tool catalogue", () => {
  it("exposes unique, navigable tools and prevents silent dashboard losses", () => {
    expect(ALL_TOOLS_CATALOG).toHaveLength(41);
    const ids = ALL_TOOLS_CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isDashboardToolId(id)).toBe(true);
    expect(isDashboardToolId("unknown")).toBe(false);
  });

  it("exposes every dashboard tool to the agent command layer", () => {
    const agentIds: Set<string> = new Set(AGENT_TOOL_DEFINITIONS.map((tool) => tool.id));
    for (const item of ALL_TOOLS_CATALOG) {
      expect(agentIds.has(item.id), item.id + " is missing from agent definitions").toBe(true);
    }
  });

  it("exposes every command palette action and panel target to the agent", () => {
    const agentIds: Set<string> = new Set(AGENT_TOOL_DEFINITIONS.map((tool) => tool.id));
    for (const command of PALETTE_COMMANDS) {
      expect(agentIds.has(command.tool), `${command.id} command is missing from agent definitions`).toBe(true);
      if (command.toolId) {
        expect(agentIds.has(command.toolId), `${command.id} panel target is missing from agent definitions`).toBe(true);
      }
    }
  });

  it("includes all supported text exports and does not advertise PDF/A without a capability", () => {
    for (const format of ["html", "rtf", "xml", "txt"]) {
      expect(isDashboardToolId("pdf-to-" + format)).toBe(true);
    }
    expect(ALL_TOOLS_CATALOG.find((tool) => tool.id === "normalize")?.capability).toBe("pdf-a");
  });
});
