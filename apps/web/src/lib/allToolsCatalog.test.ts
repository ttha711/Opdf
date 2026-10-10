import { describe, expect, it } from "vitest";
import { AGENT_TOOL_DEFINITIONS } from "../agent/definitions";
import { ALL_TOOLS_CATALOG, isDashboardToolId } from "./allToolsCatalog";

const uiOnlyTools = new Set([
  "rotate-pdf", "extract-pages", "crop-pdf", "ocr-pdf", "protect-pdf",
  "unlock-pdf", "redact-pdf", "compare-pdf", "sign-pdf",
  "measure-drawing", "edit-content", "advanced-pdf",
]);

describe("canonical PDF tool catalogue", () => {
  it("exposes unique, navigable tools and prevents silent dashboard losses", () => {
    expect(ALL_TOOLS_CATALOG).toHaveLength(40);
    const ids = ALL_TOOLS_CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isDashboardToolId(id)).toBe(true);
    expect(isDashboardToolId("unknown")).toBe(false);
  });

  it("connects UI tools with the agent catalogue unless explicitly UI only", () => {
    const agentIds: Set<string> = new Set(AGENT_TOOL_DEFINITIONS.map((tool) => tool.id));
    for (const item of ALL_TOOLS_CATALOG) {
      if (!uiOnlyTools.has(item.id)) {
        expect(agentIds.has(item.id), item.id + " is missing from agent definitions").toBe(true);
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
