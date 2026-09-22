import { describe, expect, it } from "vitest";

import { LLMAdapter, supportedModels } from "@langfuse/shared";

import {
  getLlmConnectionOptions,
  resolveConnectionProvider,
} from "./llmConnectionOptions";

const openAiDefault = supportedModels[LLMAdapter.OpenAI][0];

const connection = (overrides: Partial<Parameters<typeof make>[0]> = {}) =>
  make(overrides);

function make(overrides: {
  provider?: string;
  adapter?: LLMAdapter;
  customModels?: string[];
  withDefaultModels?: boolean;
}) {
  return {
    provider: "openai-prod",
    adapter: LLMAdapter.OpenAI,
    customModels: [],
    withDefaultModels: true,
    ...overrides,
  };
}

describe("resolveConnectionProvider", () => {
  const connections = [
    connection({ provider: "openai-prod" }),
    connection({
      provider: "custom-house",
      adapter: LLMAdapter.Anthropic,
      customModels: ["house-model"],
      withDefaultModels: false,
    }),
  ];

  it("returns undefined without a model", () => {
    expect(
      resolveConnectionProvider(connections, { provider: "openai-prod" }),
    ).toBeUndefined();
  });

  it("prefers a connection named by the provider", () => {
    expect(
      resolveConnectionProvider(connections, {
        provider: "custom-house",
        model: openAiDefault,
      }),
    ).toBe("custom-house");
  });

  it("falls back to matching the adapter when no connection carries that name", () => {
    expect(
      resolveConnectionProvider(connections, {
        provider: LLMAdapter.Anthropic,
        model: "house-model",
      }),
    ).toBe("custom-house");
  });

  it("falls back to whichever connection offers the model", () => {
    expect(
      resolveConnectionProvider(connections, { model: "house-model" }),
    ).toBe("custom-house");
  });

  it("returns undefined when nothing offers the model", () => {
    expect(
      resolveConnectionProvider(connections, { model: "unlisted-model" }),
    ).toBeUndefined();
  });
});

describe("getLlmConnectionOptions", () => {
  it("lists default models before custom ones in the picker combinations", () => {
    const { providerModelCombinations } = getLlmConnectionOptions({
      connections: [connection({ customModels: ["house-model"] })],
      selectedProvider: "openai-prod",
    });

    expect(providerModelCombinations[0]).toBe(`openai-prod: ${openAiDefault}`);
    expect(providerModelCombinations.at(-1)).toBe("openai-prod: house-model");
  });

  it("lists custom models before default ones for the selected provider", () => {
    const { availableModels } = getLlmConnectionOptions({
      connections: [connection({ customModels: ["house-model"] })],
      selectedProvider: "openai-prod",
    });

    expect(availableModels[0]).toBe("house-model");
    expect(availableModels).toContain(openAiDefault);
  });

  it("offers no models when the selected provider has no connection", () => {
    const { availableModels, selectedConnection } = getLlmConnectionOptions({
      connections: [connection()],
      selectedProvider: "not-configured",
    });

    expect(availableModels).toEqual([]);
    expect(selectedConnection).toBeUndefined();
  });

  it("injects a pinned model no connection lists, so it stays selectable", () => {
    const { availableModels, providerModelCombinations, extraProvider } =
      getLlmConnectionOptions({
        connections: [connection()],
        selectedProvider: "openai-prod",
        extraModel: { provider: "openai-prod", model: "retired-model" },
      });

    expect(extraProvider).toBe("openai-prod");
    expect(availableModels).toContain("retired-model");
    expect(providerModelCombinations).toContain("openai-prod: retired-model");
  });

  it("does not inject a pinned model into another provider's list", () => {
    const { availableModels } = getLlmConnectionOptions({
      connections: [
        connection({ provider: "openai-prod" }),
        connection({
          provider: "anthropic-prod",
          adapter: LLMAdapter.Anthropic,
        }),
      ],
      selectedProvider: "anthropic-prod",
      extraModel: { provider: "openai-prod", model: "retired-model" },
    });

    expect(availableModels).not.toContain("retired-model");
  });

  it("does not duplicate a pinned model the connection already lists", () => {
    const { providerModelCombinations } = getLlmConnectionOptions({
      connections: [connection()],
      selectedProvider: "openai-prod",
      extraModel: { provider: "openai-prod", model: openAiDefault },
    });

    expect(
      providerModelCombinations.filter(
        (combination) => combination === `openai-prod: ${openAiDefault}`,
      ),
    ).toHaveLength(1);
  });
});
