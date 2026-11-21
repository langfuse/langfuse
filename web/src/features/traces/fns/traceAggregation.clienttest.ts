import { describe, expect, it } from "vitest";

import {
  countObservationLevels,
  visibleObservationLevelCounts,
} from "./traceAggregation";

describe("countObservationLevels", () => {
  it("returns zeros for an empty list", () => {
    expect(countObservationLevels([])).toEqual({
      ERROR: 0,
      WARNING: 0,
      DEFAULT: 0,
      DEBUG: 0,
    });
  });

  it("counts official levels and ignores unknown or missing ones", () => {
    expect(
      countObservationLevels([
        { level: "DEFAULT" },
        { level: "DEFAULT" },
        { level: "ERROR" },
        { level: "WARNING" },
        { level: "DEBUG" },
        { level: "INFO" },
        { level: "error" },
        { level: null },
        {},
      ]),
    ).toEqual({
      ERROR: 1,
      WARNING: 1,
      DEFAULT: 2,
      DEBUG: 1,
    });
  });
});

describe("visibleObservationLevelCounts", () => {
  it("returns nothing when the trace has no observations", () => {
    expect(
      visibleObservationLevelCounts(
        { ERROR: 0, WARNING: 0, DEFAULT: 0, DEBUG: 0 },
        false,
      ),
    ).toEqual([]);
  });

  it("always includes error and default so success vs failure is glanceable", () => {
    expect(
      visibleObservationLevelCounts(
        { ERROR: 0, WARNING: 0, DEFAULT: 12, DEBUG: 0 },
        true,
      ),
    ).toEqual([
      { level: "ERROR", count: 0, label: "error", color: null },
      { level: "DEFAULT", count: 12, label: "default", color: null },
    ]);
  });

  it("emphasizes non-zero error and warning, and shows debug only when present", () => {
    expect(
      visibleObservationLevelCounts(
        { ERROR: 2, WARNING: 1, DEFAULT: 12, DEBUG: 3 },
        true,
      ),
    ).toEqual([
      { level: "ERROR", count: 2, label: "error", color: "error" },
      { level: "WARNING", count: 1, label: "warning", color: "warning" },
      { level: "DEFAULT", count: 12, label: "default", color: null },
      { level: "DEBUG", count: 3, label: "debug", color: null },
    ]);
  });

  it("hides zero warning and debug counts", () => {
    expect(
      visibleObservationLevelCounts(
        { ERROR: 1, WARNING: 0, DEFAULT: 4, DEBUG: 0 },
        true,
      ),
    ).toEqual([
      { level: "ERROR", count: 1, label: "error", color: "error" },
      { level: "DEFAULT", count: 4, label: "default", color: null },
    ]);
  });
});
