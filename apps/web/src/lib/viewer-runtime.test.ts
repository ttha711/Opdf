import { describe, expect, it } from "vitest";
import { getViewerControls, registerViewerControls } from "./viewer-runtime";

describe("viewer control registration", () => {
  it("restores existing reader controls after native editor exits", () => {
    const reader = { zoomIn: () => {} };
    const nativeEditor = { zoomOut: () => {} };
    const unmountReader = registerViewerControls(reader);
    expect(getViewerControls()).toBe(reader);
    const unmountNative = registerViewerControls(nativeEditor);
    expect(getViewerControls()).toBe(nativeEditor);
    unmountNative();
    expect(getViewerControls()).toBe(reader);
    unmountReader();
    expect(getViewerControls()).toBeNull();
  });

  it("does not restore controls from a previously removed viewer", () => {
    const reader = { zoomIn: () => {} };
    const nativeEditor = { zoomOut: () => {} };
    const unmountReader = registerViewerControls(reader);
    const unmountNative = registerViewerControls(nativeEditor);
    unmountReader();
    expect(getViewerControls()).toBe(nativeEditor);
    unmountNative();
    expect(getViewerControls()).toBeNull();
  });
});
