import { describe, expect, it } from "vitest";

import { LLMAdapter } from "../types";
import { resolveLlmExecutionDecision } from "./resolveLlmExecutionDecision";

const baseParams = {
  adapter: LLMAdapter.OpenAI,
  enabledAdapters: ["openai"],
};

describe("resolveLlmExecutionDecision", () => {
  it("selects LangChain when the flag is empty", () => {
    expect(
      resolveLlmExecutionDecision({ ...baseParams, enabledAdapters: [] }),
    ).toEqual({ engine: "langchain-js" });
  });

  it("selects LangChain for non-OpenAI adapters even when openai is enabled", () => {
    for (const adapter of [
      LLMAdapter.Anthropic,
      LLMAdapter.Azure,
      LLMAdapter.Bedrock,
      LLMAdapter.VertexAI,
      LLMAdapter.GoogleAIStudio,
    ]) {
      expect(resolveLlmExecutionDecision({ ...baseParams, adapter })).toEqual({
        engine: "langchain-js",
      });
    }
  });

  it("selects the AI SDK with chat-completions by default", () => {
    expect(resolveLlmExecutionDecision(baseParams)).toEqual({
      engine: "ai-sdk",
      aiSdkAdapter: "openai",
      openAIApiMode: "chat-completions",
      translatedProviderOptions: undefined,
    });
  });

  it("selects the responses API only when useResponsesApi is true", () => {
    expect(
      resolveLlmExecutionDecision({
        ...baseParams,
        llmConnectionConfig: { useResponsesApi: true },
      }),
    ).toMatchObject({ engine: "ai-sdk", openAIApiMode: "responses" });

    expect(
      resolveLlmExecutionDecision({
        ...baseParams,
        llmConnectionConfig: { useResponsesApi: false },
      }),
    ).toMatchObject({ engine: "ai-sdk", openAIApiMode: "chat-completions" });
  });

  it("declines untranslatable provider options with the offending keys", () => {
    expect(
      resolveLlmExecutionDecision({
        ...baseParams,
        providerOptions: { reasoning_effort: "high", response_format: {} },
      }),
    ).toEqual({
      engine: "langchain-js",
      declineReason: "untranslated-provider-options:response_format",
    });
  });

  it("passes translated provider options through the decision", () => {
    expect(
      resolveLlmExecutionDecision({
        ...baseParams,
        providerOptions: { reasoning_effort: "high" },
      }),
    ).toMatchObject({
      engine: "ai-sdk",
      translatedProviderOptions: { reasoningEffort: "high" },
    });
  });
});
