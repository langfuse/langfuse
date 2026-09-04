import { describe, it, expect } from "vitest";

import { UsageDetails } from "./types";

/**
 * Regression tests for issue #14987: when a provider reports a token
 * sub-count that is larger than its parent (e.g. `reasoning_tokens` >
 * `completion_tokens`), the detail bucket must be capped at the remaining
 * parent budget so the buckets plus the residual still sum back to the
 * parent count and never go negative.
 */
describe("UsageDetails token-detail capping", () => {
  it("caps completion detail buckets that exceed completion_tokens (#14987)", () => {
    const result = UsageDetails.parse({
      prompt_tokens: 1640,
      completion_tokens: 102,
      total_tokens: 1742,
      completion_tokens_details: { reasoning_tokens: 109 },
    }) as Record<string, number>;

    // bucket capped to the parent, residual clamped to 0
    expect(result.output_reasoning_tokens).toBe(102);
    expect(result.output).toBe(0);
    // invariant: residual + buckets === parent completion_tokens
    expect(result.output + result.output_reasoning_tokens).toBe(102);
  });

  it("caps prompt detail buckets that exceed prompt_tokens", () => {
    const result = UsageDetails.parse({
      prompt_tokens: 50,
      completion_tokens: 10,
      total_tokens: 60,
      prompt_tokens_details: { cached_tokens: 80 },
    }) as Record<string, number>;

    expect(result.input_cached_tokens).toBe(50);
    expect(result.input).toBe(0);
    expect(result.input + result.input_cached_tokens).toBe(50);
  });

  it("caps Responses-API output detail buckets that exceed output_tokens", () => {
    const result = UsageDetails.parse({
      input_tokens: 1640,
      output_tokens: 102,
      total_tokens: 1742,
      output_tokens_details: { reasoning_tokens: 109 },
    }) as Record<string, number>;

    expect(result.output_reasoning_tokens).toBe(102);
    expect(result.output).toBe(0);
    expect(result.output + result.output_reasoning_tokens).toBe(102);
  });

  it("leaves well-formed sub-counts untouched", () => {
    const result = UsageDetails.parse({
      prompt_tokens: 100,
      completion_tokens: 100,
      total_tokens: 200,
      completion_tokens_details: { reasoning_tokens: 40 },
    }) as Record<string, number>;

    // residual is the remaining, bucket keeps its reported value
    expect(result.output_reasoning_tokens).toBe(40);
    expect(result.output).toBe(60);
    expect(result.output + result.output_reasoning_tokens).toBe(100);
  });
});
