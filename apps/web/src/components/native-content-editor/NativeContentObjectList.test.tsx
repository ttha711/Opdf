import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PdfContentObject } from "@tpdf/core";
import { NativeContentObjectList } from "./NativeContentObjectList";

const mock = (id: string, kind: "text" | "image" | "path") => ({
  id, kind, text: kind === "text" ? "Example heading" : undefined,
  bounds: { x: 0, y: 0, width: 20, height: 10 },
}) as PdfContentObject;

describe("PDF native object inspector", () => {
  it("always offers text search and type filters on small documents", () => {
    const html = renderToStaticMarkup(
      <NativeContentObjectList objects={[mock("text-1", "text"), mock("img-2", "image")]}
        selectedId="text-1" loading={false} onSelect={vi.fn()} />,
    );
    expect(html).toContain('aria-label="Find PDF object"');
    expect(html).toContain('data-tpdf-object-filter="text"');
    expect(html).toContain('data-tpdf-object-filter="image"');
    expect(html).toContain("2 of 2");
    expect(html).toContain('data-tpdf-object-id="text-1"');
    expect(html).toContain('aria-pressed="true"');
  });

  it("preserves object depth and selection metadata", () => {
    const html = renderToStaticMarkup(<NativeContentObjectList
      objects={[mock("path-3", "path")]} selectedId="path-3" loading={false} onSelect={vi.fn()} />);
    expect(html).toContain('data-tpdf-object-kind="path"');
    expect(html).toContain('data-tpdf-object-depth="0"');
    expect(html).toContain('data-tpdf-bounds="0,0,20,10"');
  });
});
