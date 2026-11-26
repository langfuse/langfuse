import { describe, expect, it } from "vitest";
import { traceSpaceOf } from "./traceSpaceOf";
import { zoomToSpan } from "./zoomToSpan";
import { zoomView } from "./zoomView";

describe("zoomView", () => {
  it("zooms about the anchor and zoom-to-span pads both sides", () => {
    const space = traceSpaceOf(1_000);
    const zoomed = zoomView({ start: 0, duration: 1_000 }, space, {
      factor: 2,
      anchorRatio: 0.5,
    });
    expect(zoomed).toEqual({ start: 250, duration: 500 });

    const fitted = zoomToSpan({ start: 400, duration: 100 }, space, 0.1);
    expect(fitted.start).toBeCloseTo(390, 6);
    expect(fitted.duration).toBeCloseTo(120, 6);
  });
});
