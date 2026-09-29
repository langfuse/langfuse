import { describe, expect, it } from "vitest";

import { UsageDetails } from "./types";

describe("OpenAI usage details", () => {
  it.each([
    {
      usage: {
        prompt_tokens: 194,
        completion_tokens: 2,
        total_tokens: 196,
        prompt_tokens_details: { cached_tokens: 4 },
        cost: 0.0001,
        cost_details: { upstream_inference_cost: 0.0001 },
      },
      expected: {
        input: 190,
        output: 2,
        total: 196,
        input_cached_tokens: 4,
      },
    },
    {
      usage: {
        input_tokens: 194,
        output_tokens: 2,
        total_tokens: 196,
        input_tokens_details: { cached_tokens: 4 },
        cost: 0.0001,
      },
      expected: {
        input: 190,
        output: 2,
        total: 196,
        input_cached_tokens: 4,
      },
    },
  ])(
    "normalizes usage with provider-specific fields %#",
    ({ usage, expected }) => {
      expect(UsageDetails.parse(usage)).toEqual(expected);
    },
  );
});
