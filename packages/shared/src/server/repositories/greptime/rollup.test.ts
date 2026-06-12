import { describe, expect, it } from "vitest";

import { ObservationLevel } from "../../../domain";
import {
  mapAggregatedLevelRank,
  mergeUsageOrCostMaps,
  parseScoresAgg,
} from "./rollup";

describe("mergeUsageOrCostMaps", () => {
  it("sums every key across maps, preserving dynamic keys", () => {
    const merged = mergeUsageOrCostMaps([
      { input: 10, output: 20, total: 30, cache_read: 5 },
      { input: 1, output: 2, total: 3, reasoning: 7 },
    ]);
    expect(merged).toEqual({
      input: 11,
      output: 22,
      total: 33,
      cache_read: 5,
      reasoning: 7,
    });
  });

  it("ignores null/undefined maps and non-finite values", () => {
    const merged = mergeUsageOrCostMaps([
      null,
      undefined,
      { input: 5, bad: NaN as unknown as number },
    ]);
    expect(merged).toEqual({ input: 5 });
  });
});

describe("mapAggregatedLevelRank", () => {
  it("maps the integer rank back to the level string", () => {
    expect(mapAggregatedLevelRank(3)).toBe(ObservationLevel.ERROR);
    expect(mapAggregatedLevelRank(2)).toBe(ObservationLevel.WARNING);
    expect(mapAggregatedLevelRank(1)).toBe(ObservationLevel.DEFAULT);
    expect(mapAggregatedLevelRank(0)).toBe(ObservationLevel.DEBUG);
    expect(mapAggregatedLevelRank(null)).toBe(ObservationLevel.DEBUG);
  });
});

describe("parseScoresAgg", () => {
  it("parses numeric scores splitting on the last `::` and passes categoricals through", () => {
    const { scores_avg, score_categories } = parseScoresAgg(
      ["quality::0.8", "latency::ms::1200", null],
      ["sentiment:positive", null, "tier:gold"],
    );
    expect(scores_avg).toEqual([
      { name: "quality", avg_value: 0.8 },
      // name itself contains `::` -> split on the LAST one
      { name: "latency::ms", avg_value: 1200 },
    ]);
    expect(score_categories).toEqual(["sentiment:positive", "tier:gold"]);
  });

  it("returns empty arrays for null inputs", () => {
    expect(parseScoresAgg(null, undefined)).toEqual({
      scores_avg: [],
      score_categories: [],
    });
  });
});
