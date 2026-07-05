import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchLLMCompletion } from "./fetchLLMCompletion";
import { executeAiSdkCompletion } from "./ai-sdk/executeAiSdkCompletion";
import {
  ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  LLMAdapter,
} from "./types";

vi.mock("../../env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      LANGFUSE_LLM_COMPLETION_AI_SDK_ADAPTERS: ["openai"],
    },
  };
});

vi.mock("../../encryption", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../encryption")>();
  return {
    ...actual,
    decrypt: (value: string) => value,
  };
});

vi.mock("./ai-sdk/executeAiSdkCompletion", () => ({
  executeAiSdkCompletion: vi.fn().mockResolvedValue("ai sdk result"),
}));

const mockExecutor = vi.mocked(executeAiSdkCompletion);

const messages: ChatMessage[] = [
  { type: ChatMessageType.User, role: ChatMessageRole.User, content: "Hi" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchLLMCompletion execution engine dispatch", () => {
  it("routes rolled-out OpenAI calls to the AI SDK executor", async () => {
    const result = await fetchLLMCompletion({
      streaming: false,
      messages,
      modelParams: {
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        model: "gpt-4o",
        max_tokens: 64,
      },
      llmConnection: {
        secretKey: "sk-test",
        baseURL: "https://api.openai.com/v1",
        config: { useResponsesApi: true },
      },
    });

    expect(result).toBe("ai sdk result");
    expect(mockExecutor).toHaveBeenCalledTimes(1);
    expect(mockExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-test",
        baseURL: "https://api.openai.com/v1",
        streaming: false,
        apiMode: "responses",
        timeoutMs: expect.any(Number),
        fetch: expect.any(Function),
      }),
    );
  });

  it("keeps non-OpenAI adapters on LangChain", async () => {
    // The Bedrock LangChain path throws synchronously on the missing region
    // config, before any network call; the assertion that matters is that the
    // AI SDK executor was never consulted.
    await fetchLLMCompletion({
      streaming: false,
      messages,
      modelParams: {
        provider: "bedrock",
        adapter: LLMAdapter.Bedrock,
        model: "anthropic.claude-3-5-sonnet",
      },
      llmConnection: { secretKey: "not-a-bedrock-credential" },
      maxRetries: 0,
    }).catch(() => undefined);

    expect(mockExecutor).not.toHaveBeenCalled();
  });
});
