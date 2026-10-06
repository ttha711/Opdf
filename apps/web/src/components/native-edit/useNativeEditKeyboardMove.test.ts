import { describe, expect, it } from "vitest";
import { nativeEditKeyboardStep } from "./useNativeEditKeyboardMove";

describe("nativeEditKeyboardStep", () => {
  it("accelerates as an arrow key is held", () => {
    expect(nativeEditKeyboardStep(0)).toBe(1);
    expect(nativeEditKeyboardStep(500)).toBe(2);
    expect(nativeEditKeyboardStep(1_000)).toBe(4);
    expect(nativeEditKeyboardStep(2_000)).toBe(8);
  });

  it("keeps Shift as a faster movement modifier", () => {
    expect(nativeEditKeyboardStep(0, true)).toBe(5);
    expect(nativeEditKeyboardStep(1_000, true)).toBe(20);
  });
});
