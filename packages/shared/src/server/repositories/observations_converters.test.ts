import { describe, expect, it } from "vitest";

import { reduceUsageOrCostDetails } from "./observations_converters";

describe("reduceUsageOrCostDetails", () => {
  // The usage-details contract (docs: token-and-cost-tracking) promises that
  // the displayed input/output sums include every detail key CONTAINING
  // "input"/"output". The breakdown tooltip in web already aggregates that
  // way; this reducer feeds the table columns and the public API and must
  // agree with both.
  it("counts Anthropic-convention cache keys into the input aggregate", () => {
    const reduced = reduceUsageOrCostDetails({
      input: 2,
      output: 13,
      cache_read_input_tokens: 10692,
      cache_creation_input_tokens: 592,
      total: 11299,
    });

    expect(reduced.input).toBe(2 + 10692 + 592);
    expect(reduced.output).toBe(13);
    expect(reduced.total).toBe(11299);
  });

  it("aggregates cost details with the same key semantics as usage details", () => {
    const reduced = reduceUsageOrCostDetails({
      input: 0.00001,
      output: 0.000325,
      cache_read_input_tokens: 0.005346,
      cache_creation_input_tokens: 0.0037,
      total: 0.009381,
    });

    expect(reduced.input).toBeCloseTo(0.009056, 9);
    expect(reduced.output).toBeCloseTo(0.000325, 9);
    expect(reduced.total).toBeCloseTo(0.009381, 9);
  });

  it("counts OpenAI-convention cached and audio buckets into the aggregates", () => {
    const reduced = reduceUsageOrCostDetails({
      input: 100,
      input_cached_tokens: 80,
      audio_input_tokens: 20,
      output: 50,
      output_reasoning_tokens: 30,
      total: 280,
    });

    expect(reduced.input).toBe(200);
    expect(reduced.output).toBe(80);
    expect(reduced.total).toBe(280);
  });

  it("keeps reasoning tokens in the output aggregate", () => {
    const reduced = reduceUsageOrCostDetails({
      input: 10,
      output: 5,
      output_reasoning_tokens: 7,
      total: 22,
    });

    expect(reduced.output).toBe(12);
  });

  it("returns null aggregates when no key matches", () => {
    expect(reduceUsageOrCostDetails({ total: 5 })).toEqual({
      input: null,
      output: null,
      total: 5,
    });
    expect(reduceUsageOrCostDetails({})).toEqual({
      input: null,
      output: null,
      total: null,
    });
    expect(reduceUsageOrCostDetails(null)).toEqual({
      input: null,
      output: null,
      total: null,
    });
    expect(reduceUsageOrCostDetails(undefined)).toEqual({
      input: null,
      output: null,
      total: null,
    });
  });

  it("preserves an explicit zero total instead of treating it as missing", () => {
    expect(reduceUsageOrCostDetails({ total: 0 })).toEqual({
      input: null,
      output: null,
      total: 0,
    });
    expect(reduceUsageOrCostDetails({ input: 0, output: 0, total: 0 })).toEqual(
      {
        input: 0,
        output: 0,
        total: 0,
      },
    );
  });

  it("does not misclassify the total key", () => {
    const reduced = reduceUsageOrCostDetails({ total: 42 });
    expect(reduced.input).toBeNull();
    expect(reduced.output).toBeNull();
    expect(reduced.total).toBe(42);
  });
});
