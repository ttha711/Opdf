import { describe, expect, it } from "vitest";
import { groupTextItemsIntoLines, joinMatchedItems } from "./PdfTextSelection.utils";

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
});
