import { describe, expect, it } from "vitest";
import { MAX_ZOOM_PRECISION_MS } from "../constants";
import { clampView } from "./clampView";
import { traceSpaceOf } from "./traceSpaceOf";

describe("clampView", () => {
  it("clamps the window inside trace space and floors the zoom", () => {
    const space = traceSpaceOf(1_000);

    expect(clampView({ start: -500, duration: 5_000 }, space)).toEqual({
      start: 0,
      duration: 1_000,
    });
    // Panning past the end holds the zoom level and pulls the start back.
    expect(clampView({ start: 900, duration: 400 }, space)).toEqual({
      start: 600,
      duration: 400,
    });
    expect(
      clampView({ start: 0, duration: 0.001 }, space).duration,
    ).toBeCloseTo(MAX_ZOOM_PRECISION_MS, 6);
    expect(clampView({ start: NaN, duration: NaN }, space)).toEqual({
      start: 0,
      duration: 1_000,
    });
    // A collapsed trace has nowhere to zoom to.
    expect(clampView({ start: 0, duration: 10 }, traceSpaceOf(0))).toEqual({
      start: 0,
      duration: 0,
    });
  });
});
