import { describe, expect, it } from "vitest";
import {
  getDocumentToolLabel,
  getEditorLaunchError,
  getEditorLaunchTitle,
} from "./documentEditingExperience";

describe("document editing experience copy", () => {
  it("frames PDF to Office actions as AI editing outcomes", () => {
    expect(getDocumentToolLabel("pdf-to-ms-office")).toBe("Edit with AI in MS Office");
    expect(getDocumentToolLabel("pdf-to-word")).toBe("Edit with AI in MS Office");
    expect(getDocumentToolLabel("pdf-to-excel")).toBe("Edit spreadsheet with AI");
    expect(getDocumentToolLabel("pdf-to-ppt")).toBe("Create slides with AI");
    expect(getDocumentToolLabel("pdf-to-html")).toBe("Edit content with AI");
    expect(getDocumentToolLabel("pdf-to-ms-office")).not.toMatch(/HTML|Web|convert/i);
    expect(getDocumentToolLabel("pdf-to-html")).not.toMatch(/HTML|Web|convert/i);
  });

  it("launches the separate 5175 app as AI Document Editor copy", () => {
    expect(getEditorLaunchTitle()).toBe("AI Document Editor");
    expect(getEditorLaunchError()).toContain("AI Document Editor");
    expect(getEditorLaunchError()).not.toMatch(/PDF to Web|HTML/i);
  });
});
