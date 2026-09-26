import { describe, expect, it } from "vitest";

import { UsageDetails } from "./types";

describe("UsageDetails", () => {
  describe("OpenAI cache write tokens", () => {
    it("stores Responses API input_tokens_details.cache_write_tokens as input_cache_creation", () => {
      const usageDetails = UsageDetails.parse({
        input_tokens: 100_000,
        output_tokens: 1_000,
        total_tokens: 101_000,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 80_000 },
        output_tokens_details: { reasoning_tokens: 0 },
      });

      expect(usageDetails).toEqual({
        input: 20_000,
        output: 1_000,
        total: 101_000,
        input_cached_tokens: 0,
        input_cache_creation: 80_000,
        output_reasoning_tokens: 0,
      });
    });

    it("stores Chat Completions prompt_tokens_details.cache_write_tokens as input_cache_creation", () => {
      const usageDetails = UsageDetails.parse({
        prompt_tokens: 100_000,
        completion_tokens: 1_000,
        total_tokens: 101_000,
        prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 80_000 },
        completion_tokens_details: { reasoning_tokens: 0 },
      });

      expect(usageDetails).toEqual({
        input: 20_000,
        output: 1_000,
        total: 101_000,
        input_cached_tokens: 0,
        input_cache_creation: 80_000,
        output_reasoning_tokens: 0,
      });
    });
  });
});
