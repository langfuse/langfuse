import { describe, expect, it } from "vitest";

import { parsePromptModelConfig } from "./promptModelConfig";

describe("parsePromptModelConfig", () => {
  describe("configs without model settings", () => {
    it.each([
      ["null config", null],
      ["undefined config", undefined],
      ["string config", "some config"],
      ["array config", [{ model: "gpt-4.1" }]],
      ["empty object", {}],
      ["only unrelated keys", { foo: "bar", customer: "acme" }],
      ["only tool definitions", { tools: [{ name: "get_weather" }] }],
      ["null model", { model: null }],
      ["undefined temperature", { temperature: undefined }],
    ])("returns none for %s", (_label, config) => {
      expect(parsePromptModelConfig(config)).toEqual({ status: "none" });
    });
  });

  describe("valid model configs", () => {
    it("reads provider, model and every inference parameter", () => {
      expect(
        parsePromptModelConfig({
          provider: "openai",
          model: "gpt-4.1",
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: 1024,
          maxReasoningTokens: 2048,
          providerOptions: { openai: { store: true } },
        }),
      ).toEqual({
        status: "valid",
        modelConfig: {
          provider: "openai",
          model: "gpt-4.1",
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: 1024,
          maxReasoningTokens: 2048,
          providerOptions: { openai: { store: true } },
        },
      });
    });

    it("ignores keys it does not own", () => {
      expect(
        parsePromptModelConfig({
          model: "gpt-4.1",
          tools: [{ name: "get_weather" }],
          owner: "growth-team",
        }),
      ).toEqual({ status: "valid", modelConfig: { model: "gpt-4.1" } });
    });

    it("coerces numeric parameters written as strings", () => {
      expect(
        parsePromptModelConfig({ model: "gpt-4.1", temperature: "0.7" }),
      ).toEqual({
        status: "valid",
        modelConfig: { model: "gpt-4.1", temperature: 0.7 },
      });
    });

    it("accepts parameters without a model", () => {
      expect(parsePromptModelConfig({ temperature: 0.2 })).toEqual({
        status: "valid",
        modelConfig: { temperature: 0.2 },
      });
    });

    it("accepts a model without a provider", () => {
      expect(parsePromptModelConfig({ model: "gpt-4.1" })).toEqual({
        status: "valid",
        modelConfig: { model: "gpt-4.1" },
      });
    });
  });

  describe("invalid model configs", () => {
    it.each([
      ["a non-numeric temperature", { model: "gpt-4.1", temperature: "hot" }],
      ["an empty model", { model: "" }],
      ["a non-string model", { model: 4 }],
      ["an empty provider", { provider: "", model: "gpt-4.1" }],
      [
        "a non-object providerOptions",
        { model: "gpt-4.1", providerOptions: 1 },
      ],
    ])("returns invalid for %s", (_label, config) => {
      expect(parsePromptModelConfig(config)).toEqual({ status: "invalid" });
    });

    it("rejects the whole config when one parameter is unreadable", () => {
      expect(
        parsePromptModelConfig({
          model: "gpt-4.1",
          temperature: 0.2,
          max_tokens: "lots",
        }),
      ).toEqual({ status: "invalid" });
    });
  });
});
