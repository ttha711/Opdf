import { describe, expect, it } from "vitest";
import { buildTextExportFromPages } from "./pdfTextExport";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("PDF text export formats", () => {
  it("builds plain text with page boundaries", () => {
    const result = buildTextExportFromPages(["First page", "Second page"], "sample.pdf", "txt");
    expect(result.fileName).toBe("sample.txt");
    expect(decode(result.bytes)).toContain("--- Page 1 ---");
    expect(decode(result.bytes)).toContain("Second page");
  });

  it("escapes XML content safely", () => {
    const result = buildTextExportFromPages(['A < B & "quoted"'], "sample.pdf", "xml");
    const xml = decode(result.bytes);
    expect(result.fileName).toBe("sample.xml");
    expect(xml).toContain("A &lt; B &amp; &quot;quoted&quot;");
    expect(xml).not.toContain("A < B");
  });

  it("builds standalone HTML", () => {
    const result = buildTextExportFromPages(["<script>alert(1)</script>"], "sample.pdf", "html");
    const html = decode(result.bytes);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("escapes RTF control characters", () => {
    const result = buildTextExportFromPages(["A {brace} \\ path"], "sample.pdf", "rtf");
    const rtf = decode(result.bytes);
    expect(result.fileName).toBe("sample.rtf");
    expect(rtf).toContain("\\{brace\\}");
    expect(rtf).toContain("\\\\ path");
  });
});
