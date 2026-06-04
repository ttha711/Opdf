import { describe, expect, it } from "vitest";
import {
  getDocumentToolLabel,
  getEditorLaunchError,
  getEditorLaunchTitle,
} from "./documentEditingExperience";

describe("document editing experience copy", () => {
  it("frames PDF to Office actions as AI editing outcomes", () => {
    expect(getDocumentToolLabel("pdf-to-ms-office")).toBe("Sửa bằng AI sang MS Office");
    expect(getDocumentToolLabel("pdf-to-word")).toBe("Sửa bằng AI sang MS Office");
    expect(getDocumentToolLabel("pdf-to-excel")).toBe("Sửa bảng bằng AI");
    expect(getDocumentToolLabel("pdf-to-ppt")).toBe("Tạo slide bằng AI");
    expect(getDocumentToolLabel("pdf-to-html")).toBe("Sửa nội dung bằng AI");
    expect(getDocumentToolLabel("pdf-to-ms-office")).not.toMatch(/HTML|Web|convert/i);
    expect(getDocumentToolLabel("pdf-to-html")).not.toMatch(/HTML|Web|convert/i);
  });

  it("launches the separate 5175 app as AI Document Editor copy", () => {
    expect(getEditorLaunchTitle()).toBe("AI Document Editor");
    expect(getEditorLaunchError()).toContain("AI Document Editor");
    expect(getEditorLaunchError()).not.toMatch(/PDF to Web|HTML/i);
  });
});
