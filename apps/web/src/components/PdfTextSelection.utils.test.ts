import { describe, expect, it } from "vitest";
import { groupTextItemsIntoLines, joinMatchedItems, matchTextItemsToRects, sortItemsInReadingOrder } from "./PdfTextSelection.utils";

describe("joinMatchedItems", () => {
  it("reconstructs wrapped PDF text with hyphenated fragments", () => {
    expect(
      joinMatchedItems([
        { str: "360i, our all", left: 0, top: 0, width: 130, height: 23, fontSize: 23, transform: "" },
        { str: "-", left: 130, top: 0, width: 13, height: 23, fontSize: 23, transform: "" },
        { str: "in", left: 143, top: 0, width: 21, height: 23, fontSize: 23, transform: "" },
        { str: "-", left: 164, top: 0, width: 13, height: 23, fontSize: 23, transform: "" },
        { str: "one web based solution", left: 177, top: 0, width: 274, height: 23, fontSize: 23, transform: "" },
        { str: "Image Generator, powered by", left: 0, top: 82, width: 210, height: 14, fontSize: 14, transform: "" },
        { str: "nano banana pro, has a", left: 0, top: 98, width: 169, height: 14, fontSize: 14, transform: "" },
        { str: "proprietary in", left: 0, top: 116, width: 94, height: 14, fontSize: 14, transform: "" },
        { str: "-", left: 94, top: 116, width: 8, height: 14, fontSize: 14, transform: "" },
        { str: "house prompt", left: 102, top: 116, width: 99, height: 14, fontSize: 14, transform: "" },
      ] as any),
    ).toBe(
      "360i, our all-in-one web based solution\n" +
        "Image Generator, powered by\n" +
        "nano banana pro, has a\n" +
        "proprietary in-house prompt",
    );
  });

  it("groups selectable text into continuous line spans", () => {
    const lines = groupTextItemsIntoLines([
      { str: "Hello", left: 10, top: 20, width: 30, height: 10, fontSize: 10, transform: "" },
      { str: "world", left: 46, top: 20, width: 34, height: 10, fontSize: 10, transform: "" },
      { str: "Next", left: 10, top: 40, width: 28, height: 10, fontSize: 10, transform: "" },
    ] as any);

    expect(lines).toHaveLength(2);
    expect(lines[0].str).toBe("Hello world");
    expect(lines[0].left).toBe(10);
    expect(lines[0].width).toBe(70);
    expect(lines[1].str).toBe("Next");
  });

  it("matches only the selected line when nearby lines are close together", () => {
    const items = [
      { str: "Top", left: 10, top: 10, width: 30, height: 12, fontSize: 12, transform: "" },
      { str: "Middle", left: 10, top: 26, width: 52, height: 12, fontSize: 12, transform: "" },
      { str: "Bottom", left: 10, top: 42, width: 48, height: 12, fontSize: 12, transform: "" },
    ] as any;

    const matched = matchTextItemsToRects(
      items,
      [{ x: 10 / 200, y: 25 / 100, width: 60 / 200, height: 14 / 100 }],
      200,
      100,
    );

    expect(matched.map((item) => item.str)).toEqual(["Middle"]);
  });

  it("keeps multi-column reading order within each column group", () => {
    const items = [
      { str: "Left-A", left: 10, top: 10, width: 30, height: 10, fontSize: 10, transform: "" },
      { str: "Middle-A", left: 120, top: 10, width: 38, height: 10, fontSize: 10, transform: "" },
      { str: "Right-A", left: 240, top: 10, width: 34, height: 10, fontSize: 10, transform: "" },
      { str: "Left-B", left: 10, top: 28, width: 32, height: 10, fontSize: 10, transform: "" },
      { str: "Middle-B", left: 120, top: 28, width: 40, height: 10, fontSize: 10, transform: "" },
      { str: "Right-B", left: 240, top: 28, width: 36, height: 10, fontSize: 10, transform: "" },
    ] as any;

    expect(sortItemsInReadingOrder(items).map((item) => item.str)).toEqual([
      "Left-A",
      "Left-B",
      "Middle-A",
      "Middle-B",
      "Right-A",
      "Right-B",
    ]);
  });

  it("keeps fragmented text in its visual column on the workshop slide", () => {
    const items = [
      { str: "Bullet Lists (*)", left: 51.244, top: 163.41, width: 120.466, height: 18.05, fontSize: 18.05, transform: "" },
      { str: "Using `*` or `", left: 51.244, top: 217.14, width: 69.66, height: 12.29, fontSize: 12.29, transform: "" },
      { str: "-", left: 121.18, top: 217.14, width: 4.572, height: 12.29, fontSize: 12.29, transform: "" },
      { str: "` tells the AI you want a set of related,", left: 125.7, top: 217.14, width: 202.134, height: 12.29, fontSize: 12.29, transform: "" },
      { str: "non", left: 51.244, top: 238.845, width: 20.507, height: 12.265, fontSize: 12.265, transform: "" },
      { str: "-", left: 71.503, top: 238.845, width: 4.563, height: 12.265, fontSize: 12.265, transform: "" },
      { str: "sequential items. The order doesn't matter.", left: 76.022, top: 238.845, width: 226.719, height: 12.265, fontSize: 12.265, transform: "" },
      { str: "Use for:", left: 51.244, top: 292.2, width: 42.044, height: 12.29, fontSize: 12.29, transform: "" },
      { str: "Lists", left: 96.53, top: 292.2, width: 24.052, height: 12.29, fontSize: 12.29, transform: "" },
      { str: "Numbered Lists (1.)", left: 389.07, top: 163.41, width: 169.092, height: 18.05, fontSize: 18.05, transform: "" },
      { str: "Using `1.` and `2.` is a very strong signal for a", left: 389.07, top: 217.14, width: 242.519, height: 12.29, fontSize: 12.29, transform: "" },
      { str: "specific sequence. The AI will treat this as a step", left: 389.07, top: 238.845, width: 256.338, height: 12.265, fontSize: 12.265, transform: "" },
      { str: "-", left: 644.6, top: 238.845, width: 4.563, height: 12.265, fontSize: 12.265, transform: "" },
      { str: "by", left: 649.09, top: 238.845, width: 12.809, height: 12.265, fontSize: 12.265, transform: "" },
      { str: "-", left: 661.98, top: 238.845, width: 4.563, height: 12.265, fontSize: 12.265, transform: "" },
      { str: "step process.", left: 389.07, top: 260.495, width: 69.408, height: 12.265, fontSize: 12.265, transform: "" },
      { str: "Use for:", left: 389.07, top: 292.2, width: 42.216, height: 12.29, fontSize: 12.29, transform: "" },
      { str: "Step by step instructions", left: 434.38, top: 292.2, width: 130.569, height: 12.29, fontSize: 12.29, transform: "" },
      { str: "Structural Signals: Sequence (Sequencing)", left: 33.79, top: 32.426, width: 490.271, height: 23.114, fontSize: 23.114, transform: "" },
    ] as any;

    expect(sortItemsInReadingOrder(items).map((item) => item.str)).toEqual([
      "Structural Signals: Sequence (Sequencing)",
      "Bullet Lists (*)",
      "Using `*` or `",
      "-",
      "` tells the AI you want a set of related,",
      "non",
      "-",
      "sequential items. The order doesn't matter.",
      "Use for:",
      "Lists",
      "Numbered Lists (1.)",
      "Using `1.` and `2.` is a very strong signal for a",
      "specific sequence. The AI will treat this as a step",
      "-",
      "by",
      "-",
      "step process.",
      "Use for:",
      "Step by step instructions",
    ]);
  });

  it("groups lines without re-sorting already ordered items", () => {
    const lines = groupTextItemsIntoLines([
      { str: "Left-1", left: 10, top: 10, width: 40, height: 10, fontSize: 10, transform: "" },
      { str: "Left-2", left: 10, top: 26, width: 42, height: 10, fontSize: 10, transform: "" },
      { str: "Middle-1", left: 120, top: 10, width: 54, height: 10, fontSize: 10, transform: "" },
      { str: "Middle-2", left: 120, top: 26, width: 56, height: 10, fontSize: 10, transform: "" },
      { str: "Right-1", left: 240, top: 10, width: 48, height: 10, fontSize: 10, transform: "" },
      { str: "Right-2", left: 240, top: 26, width: 50, height: 10, fontSize: 10, transform: "" },
    ] as any);

    expect(lines.map((line) => line.str)).toEqual([
      "Left-1",
      "Left-2",
      "Middle-1",
      "Middle-2",
      "Right-1",
      "Right-2",
    ]);
  });
});
