import { describe, expect, it } from "vitest";

import {
  monitorEvaluationOffsetMs,
  windowToMs,
} from "@langfuse/shared/monitors";

import { __test } from "./MonitorChartPreview";

const { leadingWindowRange, toLeadingPoint } = __test;

describe("leadingWindowRange", () => {
  it("returns [now−offset−windowMs, now−offset] for a 5m window", () => {
    const now = 1_700_000_000_000;
    const windowMs = Number(windowToMs("5m"));
    const result = leadingWindowRange("5m", now);
    expect(result.toTimestamp).toBe(
      new Date(now - monitorEvaluationOffsetMs).toISOString(),
    );
    expect(result.fromTimestamp).toBe(
      new Date(now - monitorEvaluationOffsetMs - windowMs).toISOString(),
    );
  });

  it("returns [now−offset−windowMs, now−offset] for a 1h window", () => {
    const now = 1_700_000_000_000;
    const windowMs = Number(windowToMs("1h"));
    const result = leadingWindowRange("1h", now);
    expect(result.toTimestamp).toBe(
      new Date(now - monitorEvaluationOffsetMs).toISOString(),
    );
    expect(result.fromTimestamp).toBe(
      new Date(now - monitorEvaluationOffsetMs - windowMs).toISOString(),
    );
  });
});

describe("toLeadingPoint", () => {
  it("pins the scalar value to the provided toTimestamp", () => {
    const ts = "2024-01-15T12:00:00.000Z";
    const row = { count_count: "42" };
    const pt = toLeadingPoint(row, ts, "count", "count");
    expect(pt.time_dimension).toBe(ts);
    expect(pt.dimension).toBe("metric");
    expect(pt.metric).toBe(42);
  });

  it("coerces missing metric to 0", () => {
    const ts = "2024-01-15T12:00:00.000Z";
    const pt = toLeadingPoint({}, ts, "count", "count");
    expect(pt.metric).toBe(0);
  });
});
