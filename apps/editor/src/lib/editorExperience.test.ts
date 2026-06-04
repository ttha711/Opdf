import { describe, expect, it } from "vitest";
import {
  getEditorHandoffMessage,
  UNIFIED_EDITOR_COPY,
} from "./editorExperience";

describe("editor experience copy", () => {
  it("presents 5175 as one AI document editor instead of two technical workspaces", () => {
    expect(UNIFIED_EDITOR_COPY.appTitle).toBe("AI Document Editor");
    expect(UNIFIED_EDITOR_COPY.prepareWorkspaceLabel).toBe("Sửa tài liệu bằng AI");
    expect(UNIFIED_EDITOR_COPY.editWorkspaceLabel).toBe("Soạn mới từ AI");
    expect(UNIFIED_EDITOR_COPY.prepareWorkspaceLabel).not.toMatch(/HTML|Trích xuất/i);
    expect(UNIFIED_EDITOR_COPY.editWorkspaceLabel).not.toMatch(/Block Office|Soạn thảo Office|Trình chỉnh sửa/i);
  });

  it("explains incoming PDF handoff as preparing an editable document", () => {
    expect(getEditorHandoffMessage("word")).toContain("Sửa trực tiếp tại tab này");
    expect(getEditorHandoffMessage("ms-office")).toContain("Sửa trực tiếp tại tab này");
    expect(getEditorHandoffMessage("excel")).toContain("bảng tính có thể chỉnh sửa");
    expect(getEditorHandoffMessage("powerpoint")).toContain("slide có thể chỉnh sửa");
    expect(getEditorHandoffMessage("html")).not.toMatch(/HTML|chuyển đổi/i);
  });
});
