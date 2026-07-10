import { describe, expect, it } from "vitest";

import { LLMAdapter, type ModelParams } from "../types";
import { resolveLlmExecutionDecision } from "./resolveLlmExecutionDecision";

const ALL_ADAPTERS = Object.values(LLMAdapter);

const makeModelParams = (
  adapter: LLMAdapter,
  model: string,
  overrides?: Partial<ModelParams>,
): ModelParams => ({
  provider: adapter,
  adapter,
  model,
  ...overrides,
});

describe("resolveLlmExecutionDecision", () => {
  it("declines adapters that are not rolled out", () => {
    expect(
      resolveLlmExecutionDecision({
        modelParams: makeModelParams(LLMAdapter.Anthropic, "claude-sonnet-5"),
        enabledAdapters: ["openai"],
      }),
    ).toEqual({ engine: "langchain-js" });
  });

  it("selects the AI SDK per adapter with the right providerOptions namespace", () => {
    const cases: Array<{
      adapter: LLMAdapter;
      model: string;
      baseURL?: string;
      config?: Record<string, string>;
      expectedNamespace: string;
    }> = [
      {
        adapter: LLMAdapter.OpenAI,
        model: "gpt-4o",
        expectedNamespace: "openai",
      },
      {
        adapter: LLMAdapter.Azure,
        model: "my-deployment",
        baseURL: "https://instance.openai.azure.com/openai/deployments",
        expectedNamespace: "azure",
      },
      {
        adapter: LLMAdapter.Anthropic,
        model: "claude-sonnet-5",
        expectedNamespace: "anthropic",
      },
      {
        adapter: LLMAdapter.Bedrock,
        model: "anthropic.claude-3-5-sonnet",
        config: { region: "us-east-1" },
        expectedNamespace: "bedrock",
      },
      {
        adapter: LLMAdapter.GoogleAIStudio,
        model: "gemini-2.5-flash",
        expectedNamespace: "google",
      },
      {
        adapter: LLMAdapter.VertexAI,
        model: "gemini-2.5-flash",
        config: { location: "us-east5" },
        expectedNamespace: "google",
      },
      {
        adapter: LLMAdapter.VertexAI,
        model: "claude-sonnet-4-5@20250929",
        config: { location: "us-east5" },
        expectedNamespace: "anthropic",
      },
    ];

    for (const testCase of cases) {
      const decision = resolveLlmExecutionDecision({
        modelParams: makeModelParams(testCase.adapter, testCase.model),
        baseURL: testCase.baseURL,
        llmConnectionConfig: testCase.config,
        enabledAdapters: ALL_ADAPTERS,
      });

      expect(decision).toMatchObject({
        engine: "ai-sdk",
        adapter: testCase.adapter,
        providerOptionsName: testCase.expectedNamespace,
      });
    }
  });

  it("keeps chat-completions as the OpenAI default and honors useResponsesApi", () => {
    expect(
      resolveLlmExecutionDecision({
        modelParams: makeModelParams(LLMAdapter.OpenAI, "gpt-4o"),
        enabledAdapters: ALL_ADAPTERS,
      }),
    ).toMatchObject({ openAIApiMode: "chat-completions" });

    expect(
      resolveLlmExecutionDecision({
        modelParams: makeModelParams(LLMAdapter.OpenAI, "gpt-4o"),
        llmConnectionConfig: { useResponsesApi: true },
        enabledAdapters: ALL_ADAPTERS,
      }),
    ).toMatchObject({ openAIApiMode: "responses" });
  });

  it("declines on untranslatable provider options", () => {
    expect(
      resolveLlmExecutionDecision({
        modelParams: makeModelParams(LLMAdapter.Anthropic, "claude-sonnet-5", {
          providerOptions: { some_custom_param: 1 },
        }),
        enabledAdapters: ALL_ADAPTERS,
      }),
    ).toEqual({ engine: "langchain-js" });
  });

  it("declines Azure connections without a deployments base URL", () => {
    expect(
      resolveLlmExecutionDecision({
        modelParams: makeModelParams(LLMAdapter.Azure, "my-deployment"),
        baseURL: "https://proxy.example.com/openai",
        enabledAdapters: ALL_ADAPTERS,
      }),
    ).toEqual({ engine: "langchain-js" });
    expect(
      resolveLlmExecutionDecision({
        modelParams: makeModelParams(LLMAdapter.Azure, "my-deployment"),
        enabledAdapters: ALL_ADAPTERS,
      }),
    ).toEqual({ engine: "langchain-js" });
  });

  it("declines Bedrock without region config unless internal keys are used", () => {
    expect(
      resolveLlmExecutionDecision({
        modelParams: makeModelParams(LLMAdapter.Bedrock, "some-model"),
        enabledAdapters: ALL_ADAPTERS,
      }),
    ).toEqual({ engine: "langchain-js" });

    expect(
      resolveLlmExecutionDecision({
        modelParams: makeModelParams(LLMAdapter.Bedrock, "some-model"),
        shouldUseLangfuseAPIKey: true,
        enabledAdapters: ALL_ADAPTERS,
      }),
    ).toMatchObject({ engine: "ai-sdk" });
  });

  it("declines invalid Vertex locations and Claude model names", () => {
    expect(
      resolveLlmExecutionDecision({
        modelParams: makeModelParams(LLMAdapter.VertexAI, "gemini-2.5-flash"),
        llmConnectionConfig: { location: "evil.example.com/" },
        enabledAdapters: ALL_ADAPTERS,
      }),
    ).toEqual({ engine: "langchain-js" });

    expect(
      resolveLlmExecutionDecision({
        modelParams: makeModelParams(LLMAdapter.VertexAI, "claude/../other"),
        enabledAdapters: ALL_ADAPTERS,
      }),
    ).toEqual({ engine: "langchain-js" });
  });

  it("passes Vertex maxReasoningTokens into the google translation", () => {
    expect(
      resolveLlmExecutionDecision({
        modelParams: makeModelParams(LLMAdapter.VertexAI, "gemini-2.5-flash", {
          maxReasoningTokens: 2048,
        }),
        enabledAdapters: ALL_ADAPTERS,
      }),
    ).toMatchObject({
      engine: "ai-sdk",
      translatedProviderOptions: {
        thinkingConfig: { thinkingBudget: 2048, includeThoughts: true },
      },
    });

    // Google AI Studio ignores maxReasoningTokens, like LangChain.
    expect(
      resolveLlmExecutionDecision({
        modelParams: makeModelParams(
          LLMAdapter.GoogleAIStudio,
          "gemini-2.5-flash",
          { maxReasoningTokens: 2048 },
        ),
        enabledAdapters: ALL_ADAPTERS,
      }),
    ).toMatchObject({
      engine: "ai-sdk",
      translatedProviderOptions: undefined,
    });
  });

  it("drops the Vertex-Claude model override instead of declining", () => {
    expect(
      resolveLlmExecutionDecision({
        modelParams: makeModelParams(
          LLMAdapter.VertexAI,
          "claude-sonnet-4-5@20250929",
          { providerOptions: { model: "other-model" } },
        ),
        enabledAdapters: ALL_ADAPTERS,
      }),
    ).toMatchObject({
      engine: "ai-sdk",
      providerOptionsName: "anthropic",
      translatedProviderOptions: undefined,
    });
  });
});
