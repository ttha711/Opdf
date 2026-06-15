import { describe, expect, it } from "vitest";
import { extractGeneratedImageDataUrl, toImageLayerPayload } from "./fabricImageLayer.utils";

describe("fabric image layer helpers", () => {
  it("extracts a data url from a Responses API image generation payload", () => {
    const payload = {
      output: [
        { type: "message", role: "assistant" },
        { type: "image_generation_call", result: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ" },
      ],
    };

    expect(extractGeneratedImageDataUrl(payload)).toBe(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ",
    );
  });

  it("stores image layer geometry at the center of the selected region", () => {
    const payload = toImageLayerPayload({
      rect: { left: 100, top: 50, width: 200, height: 80 },
      canvasWidth: 1000,
      canvasHeight: 500,
      imageDataUrl: "data:image/png;base64,AAA",
      prompt: "replace the selected logo",
    });

    expect(payload.kind).toBe("image");
    expect(payload.x).toBeCloseTo(0.2);
    expect(payload.y).toBeCloseTo(0.18);
    expect(payload.width).toBeCloseTo(0.2);
    expect(payload.height).toBeCloseTo(0.16);
    expect(payload.angle).toBe(0);
    expect(payload.image).toBe("data:image/png;base64,AAA");
  });
});
