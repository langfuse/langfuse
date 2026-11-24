import { describe, expect, it } from "vitest";

import { buildGuardrailChartData } from "@/src/features/ai-gateway/fns/buildGuardrailChartData";

describe("buildGuardrailChartData", () => {
  const timeRange = {
    from: new Date("2026-11-01T00:00:00Z"),
    to: new Date("2026-11-03T12:00:00Z"),
  };

  it("returns empty data when there are no flagged points", () => {
    expect(
      buildGuardrailChartData({
        groupByGuardrail: false,
        points: [],
        timeRange,
        interval: "day",
      }),
    ).toEqual({ data: [], config: {} });
  });

  it("pads missing UTC buckets with zero in total mode", () => {
    const result = buildGuardrailChartData({
      groupByGuardrail: false,
      points: [{ timeDimension: "2026-11-02T00:00:00Z", count: 5 }],
      timeRange,
      interval: "day",
    });
    expect(result.data).toEqual([
      {
        time_dimension: "2026-11-01T00:00:00Z",
        dimension: "flagged",
        metric: 0,
      },
      {
        time_dimension: "2026-11-02T00:00:00Z",
        dimension: "flagged",
        metric: 5,
      },
      {
        time_dimension: "2026-11-03T00:00:00Z",
        dimension: "flagged",
        metric: 0,
      },
    ]);
    expect(result.config).toEqual({ flagged: { label: "Flagged requests" } });
  });

  it("maps guardrail series labels and keeps empty buckets on the axis in breakdown mode", () => {
    const result = buildGuardrailChartData({
      groupByGuardrail: true,
      points: [
        { timeDimension: "2026-11-02T00:00:00Z", guardrailId: "g1", count: 3 },
        { timeDimension: "2026-11-02T00:00:00Z", guardrailId: "g2", count: 1 },
      ],
      timeRange,
      interval: "day",
      labels: new Map([
        ["g1", "Block SSNs"],
        ["g2", "Log emails"],
      ]),
    });
    expect(result.data).toEqual([
      {
        time_dimension: "2026-11-01T00:00:00Z",
        dimension: undefined,
        metric: null,
      },
      { time_dimension: "2026-11-02T00:00:00Z", dimension: "g1", metric: 3 },
      { time_dimension: "2026-11-02T00:00:00Z", dimension: "g2", metric: 1 },
      {
        time_dimension: "2026-11-03T00:00:00Z",
        dimension: undefined,
        metric: null,
      },
    ]);
    expect(result.config).toEqual({
      g1: { label: "Block SSNs" },
      g2: { label: "Log emails" },
    });
  });
});
