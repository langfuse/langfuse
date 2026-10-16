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
        cost: 1,
        cost_details: { upstream_inference_cost: 0.0001 },
        custom_tokens: 7,
        invalid_tokens: -1,
      },
      expected: {
        input: 190,
        output: 2,
        total: 196,
        input_cached_tokens: 4,
        custom_tokens: 7,
      },
    },
    {
      usage: {
        input_tokens: 194,
        output_tokens: 2,
        total_tokens: 196,
        input_tokens_details: { cached_tokens: 4 },
        cost: 2,
        custom_tokens: "9",
        input: 999,
        input_cached_tokens: 999,
      },
      expected: {
        input: 190,
        output: 2,
        total: 196,
        input_cached_tokens: 4,
        custom_tokens: 9,
      },
    },
  ])(
    "normalizes usage with provider-specific fields %#",
    ({ usage, expected }) => {
      expect(UsageDetails.parse(usage)).toEqual(expected);
    },
  );
});
