import { describe, expect, it } from "vitest";

import { ZodModelConfig } from "./types";

describe("ZodModelConfig", () => {
  it("preserves AI SDK-native model settings", () => {
    expect(
      ZodModelConfig.parse({
        maxOutputTokens: 512,
        temperature: 0.2,
        topP: 0.9,
        topK: 40,
        presencePenalty: 0.1,
        frequencyPenalty: -0.2,
        stopSequences: ["DONE"],
        seed: 42,
        reasoning: "high",
        providerOptions: { openai: { reasoningSummary: "auto" } },
      }),
    ).toEqual({
      maxOutputTokens: 512,
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
      presencePenalty: 0.1,
      frequencyPenalty: -0.2,
      stopSequences: ["DONE"],
      seed: 42,
      reasoning: "high",
      providerOptions: { openai: { reasoningSummary: "auto" } },
    });
  });

  it("normalizes persisted legacy names to the AI SDK-native shape", () => {
    expect(
      ZodModelConfig.parse({
        max_tokens: 256,
        top_p: 0.8,
        maxReasoningTokens: 2048,
      }),
    ).toEqual({
      maxOutputTokens: 256,
      topP: 0.8,
      legacyReasoningTokenBudget: 2048,
    });
  });

  it("prefers canonical settings when legacy and native names coexist", () => {
    expect(
      ZodModelConfig.parse({
        maxOutputTokens: 512,
        max_tokens: 256,
        topP: 0.9,
        top_p: 0.8,
      }),
    ).toEqual({
      maxOutputTokens: 512,
      topP: 0.9,
    });
  });
});
