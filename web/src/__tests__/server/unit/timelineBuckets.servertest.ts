import { describe, expect, it } from "vitest";
import { resolveTimelineGranularity } from "@/src/features/v4/server/timelineBuckets";

const START = new Date("2026-06-01T00:00:00.000Z");
const minuteMs = 60 * 1000;

const rangeEndingAfter = (minutes: number) =>
  new Date(START.getTime() + minutes * minuteMs);

describe("resolveTimelineGranularity", () => {
  it("keeps short V4 ranges granular", () => {
    expect(resolveTimelineGranularity(START, rangeEndingAfter(5))).toBe(
      "minute",
    );
    expect(resolveTimelineGranularity(START, rangeEndingAfter(30))).toBe(
      "minute",
    );
  });

  it("matches the V4 preset bucket strategy", () => {
    expect(resolveTimelineGranularity(START, rangeEndingAfter(60))).toBe("2m");
    expect(resolveTimelineGranularity(START, rangeEndingAfter(3 * 60))).toBe(
      "5m",
    );
    expect(resolveTimelineGranularity(START, rangeEndingAfter(24 * 60))).toBe(
      "hour",
    );
    expect(
      resolveTimelineGranularity(START, rangeEndingAfter(7 * 24 * 60)),
    ).toBe("hour");
    expect(
      resolveTimelineGranularity(START, rangeEndingAfter(30 * 24 * 60)),
    ).toBe("day");
  });
});
