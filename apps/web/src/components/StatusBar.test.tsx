import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBar } from "./StatusBar";

const baseProps = {
  hasDocument: true,
  page: 1,
  totalPages: 0,
  viewerError: null,
  scale: 1,
  viewMode: "continuous" as const,
  activeTool: "select" as const,
  saveState: "saved" as const,
};

describe("StatusBar page indicator", () => {
  it("shows a loading state before the PDF page count is known", () => {
    const html = renderToStaticMarkup(<StatusBar {...baseProps} />);

    expect(html).toContain("Loading pages...");
    expect(html).toContain('data-opdf-page-loading="true"');
    expect(html).toContain('aria-label="Loading document pages"');
    expect(html).not.toContain("Page <strong>1</strong> of <strong>0</strong>");
  });


  it("offers the mobile page preview trigger once pages are known", () => {
    const html = renderToStaticMarkup(
      <StatusBar {...baseProps} totalPages={3} />,
    );

    expect(html).toContain('data-opdf-action="toggle-page-filmstrip"');
    expect(html).toContain("▣ Pages");
    expect(html).toContain('aria-expanded="false"');
  });

  it("shows the normal page indicator once the page count is known", () => {
    const html = renderToStaticMarkup(
      <StatusBar {...baseProps} totalPages={12} />,
    );

    expect(html).toContain("Page <strong>1</strong> of <strong>12</strong>");
    expect(html).toContain('data-opdf-page-loading="false"');
    expect(html).not.toContain("Loading pages...");
  });
});
