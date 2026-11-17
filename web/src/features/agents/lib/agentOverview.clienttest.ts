import { describe, expect, it } from "vitest";
import {
  type AgentOverviewBucket,
  type AgentOverviewStats,
  type AgentQualityResult,
} from "@langfuse/shared/agents";
import { prepareAgentOverview } from "./agentOverview";
import { prepareAgentQuality } from "./agentQuality";

const emptyStats: AgentOverviewStats = {
  runs: 0,
  traces: 0,
  errorRuns: 0,
  averageRunDurationMs: null,
  observations: 0,
  toolCalls: 0,
  skillLoads: 0,
  completedRuns: 0,
  unfinishedRuns: 0,
  averageRunCost: null,
  runCostKnownRuns: 0,
  modelCalls: 0,
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  cost: null,
  usageKnownCalls: 0,
  pricedModelCalls: 0,
  unattributedModelCalls: 0,
  traceUnassignedModelCalls: 0,
  cacheHitRate: null,
  cacheReadInputTokens: null,
  cacheEligibleInputTokens: null,
  knownCacheModelCalls: 0,
};
const bucket = (
  timestamp: Date,
  values: Partial<AgentOverviewBucket>,
): AgentOverviewBucket => ({
  timestamp,
  observations: 0,
  runs: 0,
  modelCalls: 0,
  toolCalls: 0,
  skillLoads: 0,
  errorRuns: 0,
  modelCost: null,
  averageRunDurationMs: null,
  averageRunCost: null,
  completedRuns: 0,
  runCostKnownRuns: 0,
  ...values,
  cacheHitRate: values.cacheHitRate ?? null,
  cacheReadInputTokens: values.cacheReadInputTokens ?? null,
  cacheEligibleInputTokens: values.cacheEligibleInputTokens ?? null,
  knownCacheModelCalls: values.knownCacheModelCalls ?? 0,
});

describe("agent overview preparation", () => {
  it("aligns the preceding period without inventing missing averages or activity", () => {
    const from = new Date("2026-11-06T12:00:00Z");
    const middle = new Date("2026-11-06T12:01:00Z");
    const prepared = prepareAgentOverview({
      current: {
        from,
        to: new Date("2026-11-06T12:02:00Z"),
        bucketMs: 60_000,
        stats: {
          ...emptyStats,
          cacheHitRate: 0,
          cacheReadInputTokens: 0,
          cacheEligibleInputTokens: 100,
          knownCacheModelCalls: 1,
        },
        buckets: [
          bucket(from, { runs: 0 }),
          bucket(middle, {
            runs: 2,
            averageRunCost: 0,
            cacheHitRate: 0,
            cacheReadInputTokens: 0,
            cacheEligibleInputTokens: 100,
            knownCacheModelCalls: 1,
          }),
        ],
      },
      previous: {
        from: new Date("2026-11-06T11:58:00Z"),
        to: from,
        bucketMs: 60_000,
        stats: { ...emptyStats, runs: 5 },
        buckets: [
          bucket(new Date("2026-11-06T11:58:00Z"), {
            runs: 5,
            averageRunCost: 0.03,
            cacheHitRate: 0.5,
            cacheReadInputTokens: 50,
            cacheEligibleInputTokens: 100,
            knownCacheModelCalls: 1,
          }),
        ],
      },
      tools: [],
      skills: [],
      toolsTotalCount: 0,
      skillsTotalCount: 0,
      groupLimit: 50,
    });
    expect(prepared.charts[0].data).toEqual([
      { x: from, values: { current: 0, previous: 5 } },
      { x: middle, values: { current: 2, previous: null } },
    ]);
    expect(prepared.charts[1].data.map((point) => point.values)).toEqual([
      { current: null, previous: 0.03 },
      { current: 0, previous: null },
    ]);
    const cache = prepared.charts.find(
      (chart) => chart.title === "Cache hit rate",
    )!;
    expect(cache.data.map((point) => point.values)).toEqual([
      { current: null, previous: 50 },
      { current: 0, previous: null },
    ]);
    expect(cache.value).toBe("0%");
    expect(cache.yAxis).toEqual({ domain: [0, 100] });
    expect(
      prepared.charts.find((chart) => chart.title === "Error-level agent runs")!
        .data[0].values.current,
    ).toBeNull();
    expect(
      prepared.charts.find((chart) => chart.title === "Error-level agent runs")!
        .yAxis,
    ).toEqual({ domain: [0, 100] });
  });

  it("preserves zero boolean scores and keeps mixed-model runs separate", () => {
    const result: AgentQualityResult = {
      from: new Date("2026-11-06T12:00:00Z"),
      to: new Date("2026-11-06T13:00:00Z"),
      previousFrom: new Date("2026-11-06T11:00:00Z"),
      previousTo: new Date("2026-11-06T12:00:00Z"),
      bucketMs: 3_600_000,
      score: {
        name: "Correct",
        dataType: "BOOLEAN",
        source: "EVAL",
        configId: null,
      },
      current: { average: 0, scoredRuns: 2, totalRuns: 3 },
      previous: { average: null, scoredRuns: 0, totalRuns: 0 },
      buckets: [
        {
          timestamp: new Date("2026-11-06T12:00:00Z"),
          average: 0,
          scoredRuns: 2,
          totalRuns: 3,
        },
      ],
      models: [
        {
          kind: "multiple",
          name: null,
          current: { average: 0, scoredRuns: 2, totalRuns: 3 },
          previous: { average: null, scoredRuns: 0, totalRuns: 0 },
        },
      ],
      hasMoreModels: false,
    };
    const prepared = prepareAgentQuality(result);
    expect(prepared.chart.value).toBe("0%");
    expect(prepared.chart.data[0].values.score).toBe(0);
    expect(prepared.chart.yAxis).toEqual({ domain: [0, 100] });
    expect(prepared.models[0]).toMatchObject({
      name: "Multiple models",
      average: "0%",
      previous: "Unknown",
      coverage: "2 / 3 runs",
    });
    const partial = prepareAgentQuality({
      ...result,
      buckets: [{ ...result.buckets[0], average: 0.5 }],
    });
    expect(partial.chart.data[0].values.score).toBe(50);
    expect(partial.chart.formatValue(50)).toBe("50%");
    const numeric = prepareAgentQuality({
      ...result,
      score: { ...result.score, dataType: "NUMERIC" },
      buckets: [{ ...result.buckets[0], average: -2 }],
    });
    expect(numeric.chart.data[0].values.score).toBe(-2);
    expect(numeric.chart.formatValue(-2)).toBe("-2");
    expect(numeric.chart.yAxis).toBeUndefined();
  });
});
