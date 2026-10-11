import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PdfStructureInventory } from "./PdfStructureInventory";

describe("PdfCraft document inventory", () => {
  it("renders source-provided layers, fonts and attachments without mutation controls", () => {
    const html = renderToStaticMarkup(
      <PdfStructureInventory inventory={{
        layers: [{name:"Drawing A",visible:true},{name:"Hidden construction",visible:false}],
        fonts: [{name:"Noto Sans",kind:"TrueType",embedded:true,subset:true}],
        attachments: [{name:"schedule.csv",size:1234}],
      }} />,
    );
    expect(html).toContain("Layers (2)");
    expect(html).toContain("Hidden construction");
    expect(html).toContain("Hidden");
    expect(html).toContain("Fonts (1)");
    expect(html).toContain("Embedded");
    expect(html).toContain("Attachments (1)");
    expect(html).toContain("schedule.csv");
    expect(html).not.toContain('type="checkbox"');
  });

  it("handles an empty or incomplete doc_info response", () => {
    const html = renderToStaticMarkup(<PdfStructureInventory inventory={{}} />);
    expect(html).toContain("No optional content layers detected");
    expect(html).toContain("No fonts reported");
    expect(html).toContain("No embedded attachments detected");
  });

  it("escapes untrusted document metadata", () => {
    const html = renderToStaticMarkup(
      <PdfStructureInventory inventory={{layers:[{name:"<img src=x onerror=alert(1)>",visible:false}]}} />,
    );
    expect(html).not.toContain("<img ");
    expect(html).toContain("&lt;img");
  });
});
