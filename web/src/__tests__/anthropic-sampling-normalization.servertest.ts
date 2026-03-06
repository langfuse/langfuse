/** @jest-environment node */

import { normalizeAnthropicSamplingParams } from "@langfuse/shared/src/server/llm/fetchLLMCompletion";

describe("normalizeAnthropicSamplingParams", () => {
  it("should remove top_p when it is not explicitly provided", () => {
    const result = normalizeAnthropicSamplingParams({
      topP: undefined,
      temperature: 0.2,
    });

    expect(result).toEqual({
      normalizedTopP: undefined,
      normalizedTemperature: 0.2,
    });
  });

  it("should keep a valid top_p value", () => {
    const result = normalizeAnthropicSamplingParams({
      topP: 0.6,
      temperature: undefined,
    });

    expect(result).toEqual({
      normalizedTopP: 0.6,
      normalizedTemperature: undefined,
    });
  });

  it("should drop invalid top_p values", () => {
    const invalidTopPValues = [
      -1,
      0,
      1.1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ];

    for (const topP of invalidTopPValues) {
      const result = normalizeAnthropicSamplingParams({
        topP,
        temperature: undefined,
      });

      expect(result.normalizedTopP).toBeUndefined();
    }
  });
});
