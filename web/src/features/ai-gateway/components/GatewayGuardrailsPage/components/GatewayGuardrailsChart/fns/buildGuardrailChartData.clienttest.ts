import { describe, expect, it } from "vitest";

import { buildGuardrailChartData } from "./buildGuardrailChartData";

describe("buildGuardrailChartData", () => {
  it("returns empty data when there are no flagged points or only WITH FILL zeros", () => {
    expect(
      buildGuardrailChartData({
        groupByGuardrail: false,
        points: [],
      }),
    ).toEqual({ data: [], config: {} });

    expect(
      buildGuardrailChartData({
        groupByGuardrail: false,
        points: [
          { timeDimension: "2026-11-01", count: 0 },
          { timeDimension: "2026-11-02", count: 0 },
        ],
      }),
    ).toEqual({ data: [], config: {} });
  });

  it("maps ClickHouse WITH FILL buckets in total mode", () => {
    const result = buildGuardrailChartData({
      groupByGuardrail: false,
      points: [
        { timeDimension: "2026-11-01", count: 0 },
        { timeDimension: "2026-11-02", count: 5 },
        { timeDimension: "2026-11-03", count: 0 },
      ],
    });
    expect(result.data).toEqual([
      { time_dimension: "2026-11-01", dimension: "flagged", metric: 0 },
      { time_dimension: "2026-11-02", dimension: "flagged", metric: 5 },
      { time_dimension: "2026-11-03", dimension: "flagged", metric: 0 },
    ]);
    expect(result.config).toEqual({ flagged: { label: "Flagged requests" } });
  });

  it("maps guardrail series labels and keeps WITH FILL markers on the axis in breakdown mode", () => {
    const result = buildGuardrailChartData({
      groupByGuardrail: true,
      points: [
        { timeDimension: "2026-11-01", guardrailId: undefined, count: 0 },
        { timeDimension: "2026-11-02", guardrailId: "g1", count: 3 },
        { timeDimension: "2026-11-02", guardrailId: "g2", count: 1 },
        { timeDimension: "2026-11-03", guardrailId: undefined, count: 0 },
      ],
      labels: new Map([
        ["g1", "Block SSNs"],
        ["g2", "Log emails"],
      ]),
    });
    expect(result.data).toEqual([
      { time_dimension: "2026-11-01", dimension: undefined, metric: null },
      { time_dimension: "2026-11-02", dimension: "g1", metric: 3 },
      { time_dimension: "2026-11-02", dimension: "g2", metric: 1 },
      { time_dimension: "2026-11-03", dimension: undefined, metric: null },
    ]);
    expect(result.config).toEqual({
      g1: { label: "Block SSNs" },
      g2: { label: "Log emails" },
    });
  });
});
