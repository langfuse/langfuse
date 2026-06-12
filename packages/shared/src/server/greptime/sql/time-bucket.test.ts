import { describe, expect, it } from "vitest";

import {
  greptimeTimeBucket,
  resolveAutoGranularity,
  GRANULARITY_STEP,
} from "./time-bucket";

describe("greptimeTimeBucket", () => {
  it("uses date_trunc for calendar granularities", () => {
    expect(greptimeTimeBucket("minute", "`timestamp`")).toBe(
      "date_trunc('minute', `timestamp`)",
    );
    expect(greptimeTimeBucket("week", "t.`timestamp`")).toBe(
      "date_trunc('week', t.`timestamp`)",
    );
    expect(greptimeTimeBucket("month", "`start_time`")).toBe(
      "date_trunc('month', `start_time`)",
    );
  });

  it("uses date_bin for fixed monitor granularities", () => {
    expect(greptimeTimeBucket("5m", "`timestamp`")).toBe(
      "date_bin('5 minutes'::INTERVAL, `timestamp`)",
    );
    expect(greptimeTimeBucket("2h", "`timestamp`")).toBe(
      "date_bin('2 hours'::INTERVAL, `timestamp`)",
    );
    expect(greptimeTimeBucket("1w", "`timestamp`")).toBe(
      "date_bin('1 week'::INTERVAL, `timestamp`)",
    );
  });
});

describe("resolveAutoGranularity", () => {
  const h = (n: number) => n * 3_600_000;
  it("mirrors the ClickHouse builder thresholds", () => {
    expect(resolveAutoGranularity(0, h(1))).toBe("minute");
    expect(resolveAutoGranularity(0, h(48))).toBe("hour");
    expect(resolveAutoGranularity(0, h(100))).toBe("day"); // ~4d
    expect(resolveAutoGranularity(0, h(1000))).toBe("day"); // ~41d, still < 60d
    expect(resolveAutoGranularity(0, h(3000))).toBe("week"); // ~125d
    expect(resolveAutoGranularity(0, h(10000))).toBe("month"); // > 1y
  });
});

describe("GRANULARITY_STEP", () => {
  it("maps each granularity to its gap-fill interval", () => {
    expect(GRANULARITY_STEP.hour).toBe("1 hour");
    expect(GRANULARITY_STEP["15m"]).toBe("15 minutes");
    expect(GRANULARITY_STEP.month).toBe("1 month");
  });
});
