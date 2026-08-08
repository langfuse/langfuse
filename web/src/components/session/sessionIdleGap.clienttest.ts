import { describe, expect, it } from "vitest";

import {
  computeIdleGapSeconds,
  formatIdleGap,
} from "@/src/components/session/sessionIdleGap";

describe("sessionIdleGap", () => {
  it("measures idle time after the previous trace ends", () => {
    const previous = {
      timestamp: new Date("2026-01-01T12:00:00.000Z"),
      latencyMs: 60_000,
    };
    const current = { timestamp: new Date("2026-01-01T12:06:00.000Z") };

    expect(computeIdleGapSeconds(previous, current)).toBe(300);
  });

  it("never returns a negative gap for overlapping traces", () => {
    const previous = {
      timestamp: new Date("2026-01-01T12:00:00.000Z"),
      latencyMs: 120_000,
    };
    const current = { timestamp: new Date("2026-01-01T12:01:00.000Z") };

    expect(computeIdleGapSeconds(previous, current)).toBe(0);
  });

  it("formats gaps as rounded minutes or hours", () => {
    expect(formatIdleGap(300)).toBe("5 min");
    expect(formatIdleGap(3600)).toBe("1 hr");
    expect(formatIdleGap(7200)).toBe("2 hrs");
  });
});
