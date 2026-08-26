import { describe, expect, it } from "vitest";

import { resolveLangfuseAIOpenAICall } from "./openaiCompatibility";

const RESPONSES = {
  apiMode: "responses" as const,
  providerOptions: { openai: { reasoningSummary: "auto" as const } },
};

const CHAT_COMPLETIONS = {
  apiMode: "chat-completions" as const,
  providerOptions: { openai: { reasoningEffort: "medium" as const } },
};

describe("resolveLangfuseAIOpenAICall", () => {
  it.each([
    {
      name: "unset URL defaults to Responses",
      baseURL: undefined,
      useResponsesApi: undefined,
      expected: RESPONSES,
    },
    {
      name: "api.openai.com defaults to Responses",
      baseURL: "https://api.openai.com/v1",
      useResponsesApi: undefined,
      expected: RESPONSES,
    },
    {
      name: "compatible proxy defaults to Chat Completions with reasoning",
      baseURL: "https://llm-exec.internal/v1",
      useResponsesApi: undefined,
      expected: CHAT_COMPLETIONS,
    },
    {
      name: "custom URL with useResponsesApi true uses Responses",
      baseURL: "https://llm-exec.internal/v1",
      useResponsesApi: true,
      expected: RESPONSES,
    },
    {
      name: "first-party with useResponsesApi false uses Chat Completions",
      baseURL: undefined,
      useResponsesApi: false,
      expected: CHAT_COMPLETIONS,
    },
  ])("$name", ({ baseURL, useResponsesApi, expected }) => {
    expect(
      resolveLangfuseAIOpenAICall({
        baseURL,
        useResponsesApi,
      }),
    ).toEqual(expected);
  });
});
