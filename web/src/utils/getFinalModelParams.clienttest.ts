import { describe, expect, it } from "vitest";

import {
  LLMAdapter,
  type UIModelParams,
  ZodModelConfig,
} from "@langfuse/shared";
import {
  getEnabledModelParamState,
  getFinalModelParams,
  normalizeLegacyUIModelParams,
} from "./getFinalModelParams";

const modelParams: UIModelParams = {
  provider: { value: "openai", enabled: true },
  adapter: { value: LLMAdapter.OpenAI, enabled: true },
  model: { value: "gpt-5.5", enabled: true },
  maxTemperature: { value: 2, enabled: false },
  maxOutputTokens: { value: 512, enabled: true },
  temperature: { value: 0.2, enabled: false },
  topP: { value: 0.9, enabled: true },
  topK: { value: 40, enabled: true },
  presencePenalty: { value: 0, enabled: false },
  frequencyPenalty: { value: 0, enabled: false },
  stopSequences: { value: ["DONE"], enabled: true },
  seed: { value: 42, enabled: true },
  reasoning: { value: "high", enabled: true },
  providerOptions: {
    value: { openai: { reasoningSummary: "auto" } },
    enabled: true,
  },
};

describe("model parameter serialization", () => {
  it("emits only enabled AI SDK-native settings", () => {
    expect(getFinalModelParams(modelParams)).toEqual({
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
      model: "gpt-5.5",
      maxOutputTokens: 512,
      topP: 0.9,
      topK: 40,
      stopSequences: ["DONE"],
      seed: 42,
      reasoning: "high",
      providerOptions: { openai: { reasoningSummary: "auto" } },
    });
  });

  it("moves the legacy Vertex reasoning budget into namespaced provider options", () => {
    const parsed = ZodModelConfig.parse({ maxReasoningTokens: 2048 });

    expect(getEnabledModelParamState(parsed)).toEqual({
      providerOptions: {
        value: { google: { thinkingBudget: 2048 } },
        enabled: true,
      },
    });
  });

  it("normalizes legacy Playground cache fields", () => {
    expect(
      normalizeLegacyUIModelParams({
        max_tokens: { value: 256, enabled: true },
        top_p: { value: 0.8, enabled: true },
        maxReasoningTokens: { value: 1024, enabled: true },
      }),
    ).toEqual({
      maxOutputTokens: { value: 256, enabled: true },
      topP: { value: 0.8, enabled: true },
      providerOptions: {
        value: { google: { thinkingBudget: 1024 } },
        enabled: true,
      },
    });
  });
});
