import { describe, expect, it } from "vitest";

import {
  convertToUITableMetrics,
  type TracesTableMetricsClickhouseReturnType,
} from "./traces-ui-table-service";

// Regression test for the traces-table cost split: the usage side already
// aggregated cache/reasoning buckets via reduceUsageOrCostDetails, but the
// cost side read only the literal 'input'/'output' keys. A trace whose cost
// sits mostly in cache_creation_input_tokens then showed ~0 input cost while
// its token column counted the very same bucket.
describe("convertToUITableMetrics", () => {
  const baseRow: TracesTableMetricsClickhouseReturnType = {
    id: "a2f30d50ccc1f5d0ba38d1a8236c50ab",
    project_id: "test-project",
    timestamp: new Date("2026-08-24T16:06:51.868Z"),
    level: "DEFAULT",
    observation_count: 2,
    latency: "4.283",
    usage_details: {},
    cost_details: {},
    scores_avg: [],
    error_count: 0,
    warning_count: 0,
    default_count: 2,
    debug_count: 0,
  };

  it("counts cache buckets in the input/output cost split, mirroring usage", () => {
    // Real numbers from an Anthropic call that wrote a 35,972-token prompt
    // cache: 98.6% of the cost lives in cache_creation_input_tokens.
    const row: TracesTableMetricsClickhouseReturnType = {
      ...baseRow,
      usage_details: {
        input: 2,
        output: 124,
        cache_creation_input_tokens: 35972,
        total: 36098,
      },
      cost_details: {
        input: 0.000004,
        output: 0.00124,
        cache_creation_input_tokens: 0.08993,
        total: 0.091173999999,
      },
    };

    const result = convertToUITableMetrics(row);

    expect(result.promptTokens).toBe(BigInt(35974));
    expect(result.completionTokens).toBe(BigInt(124));
    expect(result.totalTokens).toBe(BigInt(36098));

    expect(result.calculatedInputCost?.toNumber()).toBeCloseTo(0.089934, 9);
    expect(result.calculatedOutputCost?.toNumber()).toBeCloseTo(0.00124, 9);
    expect(result.calculatedTotalCost?.toNumber()).toBeCloseTo(
      0.091173999999,
      9,
    );

    // The split must add up to the total again (modulo float noise).
    const split =
      (result.calculatedInputCost?.toNumber() ?? 0) +
      (result.calculatedOutputCost?.toNumber() ?? 0);
    expect(split).toBeCloseTo(result.calculatedTotalCost?.toNumber() ?? 0, 9);
  });

  it("splits reasoning output cost into the output aggregate", () => {
    const row: TracesTableMetricsClickhouseReturnType = {
      ...baseRow,
      usage_details: {
        input: 100,
        output: 358,
        output_reasoning_tokens: 229,
        total: 687,
      },
      cost_details: {
        input: 0.0002,
        output: 0.00537,
        output_reasoning_tokens: 0.003435,
        total: 0.009005,
      },
    };

    const result = convertToUITableMetrics(row);

    expect(result.completionTokens).toBe(BigInt(587));
    expect(result.calculatedOutputCost?.toNumber()).toBeCloseTo(0.008805, 9);
  });

  it("keeps null costs for rows without cost details", () => {
    const result = convertToUITableMetrics(baseRow);

    expect(result.calculatedInputCost).toBeNull();
    expect(result.calculatedOutputCost).toBeNull();
    expect(result.calculatedTotalCost).toBeNull();
  });
});
