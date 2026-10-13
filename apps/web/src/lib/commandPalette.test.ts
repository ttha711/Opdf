import { describe, expect, it } from "vitest";
import { filterPaletteCommands, paletteUnavailableReason, PALETTE_COMMANDS } from "./commandPalette";

describe("PDF command palette registry", () => {
  it("keeps unique commands and routes editing operations through existing tools", () => {
    expect(PALETTE_COMMANDS.length).toBeGreaterThan(20);
    expect(new Set(PALETTE_COMMANDS.map(command => command.id)).size).toBe(PALETTE_COMMANDS.length);
    for (const command of PALETTE_COMMANDS) {
      if (command.tool === "open-tool-panel") expect(command.toolId).toBeTruthy();
      else expect(command.toolId).toBeUndefined();
    }
    expect(PALETTE_COMMANDS.find(command => command.id === "delete")?.tool).toBe("open-tool-panel");
  });

  it("supports multiple terms and prioritizes title matches", () => {
    expect(filterPaletteCommands(PALETTE_COMMANDS, "rotate page")[0]?.id).toBe("rotate");
    expect(filterPaletteCommands(PALETTE_COMMANDS, "   PAGE  DELETE ")[0]?.id).toBe("delete");
    expect(filterPaletteCommands(PALETTE_COMMANDS, "accessibility pdf")[0]?.id).toBe("health");
    expect(filterPaletteCommands(PALETTE_COMMANDS, "nonexistentxyz")).toEqual([]);
    expect(filterPaletteCommands(PALETTE_COMMANDS, "")).toEqual(PALETTE_COMMANDS);
  });

  it("disables document-specific commands until a file is open", () => {
    const edit = PALETTE_COMMANDS.find(command => command.id === "edit")!;
    const open = PALETTE_COMMANDS.find(command => command.id === "open")!;
    expect(paletteUnavailableReason(edit, false, false)).toBe("Open a PDF first");
    expect(paletteUnavailableReason(open, false, true)).toBeNull();
  });

  it("does not expose full-access panels in the public viewer", () => {
    const protect = PALETTE_COMMANDS.find(command => command.id === "protect")!;
    const note = PALETTE_COMMANDS.find(command => command.id === "note")!;
    expect(paletteUnavailableReason(protect, true, true)).toContain("TPDF Server");
    expect(paletteUnavailableReason(note, true, true)).toBeNull();
  });
});
