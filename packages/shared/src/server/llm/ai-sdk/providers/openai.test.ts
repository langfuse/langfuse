import { describe, expect, it } from "vitest";

import {
  isOpenAICompatibleEndpoint,
  translateOpenAIProviderOptions,
} from "./openai";

describe("translateOpenAIProviderOptions", () => {
  it("returns undefined for empty input", () => {
    expect(translateOpenAIProviderOptions(undefined)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(translateOpenAIProviderOptions({})).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("translates snake_case OpenAI body params to AI SDK camelCase", () => {
    const result = translateOpenAIProviderOptions({
      reasoning_effort: "high",
      service_tier: "flex",
      parallel_tool_calls: false,
      store: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        reasoningEffort: "high",
        serviceTier: "flex",
        parallelToolCalls: false,
        store: true,
      },
    });
  });

  it("passes through camelCase keys unchanged", () => {
    const result = translateOpenAIProviderOptions({
      reasoningEffort: "low",
      textVerbosity: "high",
    });

    expect(result).toEqual({
      ok: true,
      value: { reasoningEffort: "low", textVerbosity: "high" },
    });
  });

  it("merges a nested openai object verbatim", () => {
    const result = translateOpenAIProviderOptions({
      openai: { reasoningEffort: "medium", store: false },
      reasoning_effort: "high",
    });

    expect(result).toEqual({
      ok: true,
      value: { reasoningEffort: "high", store: false },
    });
  });

  it("rejects unknown keys instead of silently dropping them", () => {
    const result = translateOpenAIProviderOptions({
      reasoning_effort: "high",
      response_format: { type: "json_object" },
      some_custom_param: 1,
    });

    expect(result).toEqual({
      ok: false,
      unknownKeys: ["response_format", "some_custom_param"],
    });
  });

  it("preserves compatible-provider wire keys while passing through unknown keys", () => {
    const result = translateOpenAIProviderOptions(
      {
        reasoning_effort: "high",
        service_tier: "flex",
        parallel_tool_calls: false,
        logit_bias: { "42": 1 },
        thinkingBudget: 1024,
        thinkingLevel: "high",
      },
      { passthroughUnknown: true, target: "openai-compatible" },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        reasoningEffort: "high",
        service_tier: "flex",
        parallel_tool_calls: false,
        logit_bias: { "42": 1 },
        thinkingBudget: 1024,
        thinkingLevel: "high",
      },
    });
  });
});

describe("isOpenAICompatibleEndpoint", () => {
  it("recognizes custom OpenAI-compatible endpoints", () => {
    expect(isOpenAICompatibleEndpoint(undefined)).toBe(false);
    expect(isOpenAICompatibleEndpoint(null)).toBe(false);
    expect(isOpenAICompatibleEndpoint("https://api.openai.com/v1")).toBe(false);
    expect(
      isOpenAICompatibleEndpoint("https://openai-compatible.example.com/v1"),
    ).toBe(true);
  });

  it("does not enable passthrough mode for malformed URLs", () => {
    expect(isOpenAICompatibleEndpoint("localhost:8080")).toBe(false);
  });
});
