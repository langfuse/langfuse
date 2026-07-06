import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { generateText, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import { isLLMCompletionError } from "../errors";
import {
  ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  LLMAdapter,
  type ModelParams,
} from "../types";
import { executeAiSdkCompletion } from "./executeAiSdkCompletion";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(),
    streamText: vi.fn(),
  };
});

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(),
}));

const chatModel = { modelId: "chat-model" };
const responsesModel = { modelId: "responses-model" };
const provider = {
  chat: vi.fn(() => chatModel),
  responses: vi.fn(() => responsesModel),
};

const modelParams: ModelParams = {
  provider: "openai",
  adapter: LLMAdapter.OpenAI,
  model: "gpt-4o",
  max_tokens: 128,
  temperature: 0.2,
  top_p: 0.9,
};

const messages: ChatMessage[] = [
  {
    type: ChatMessageType.User,
    role: ChatMessageRole.User,
    content: "Hi",
  },
];

const baseParams = {
  messages,
  modelParams,
  streaming: false,
  apiKey: "sk-test",
  timeoutMs: 5_000,
  fetch: globalThis.fetch,
  apiMode: "chat-completions" as const,
};

const mockGenerateText = vi.mocked(generateText);
const mockStreamText = vi.mocked(streamText);
const mockCreateOpenAI = vi.mocked(createOpenAI);

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateOpenAI.mockReturnValue(provider as never);
});

describe("executeAiSdkCompletion", () => {
  it("builds a chat model with processed baseURL, headers, and fetch", async () => {
    mockGenerateText.mockResolvedValue({
      text: "hello",
      reasoningText: undefined,
    } as never);

    await executeAiSdkCompletion({
      ...baseParams,
      baseURL: "https://proxy.example.com/{model}/v1",
      extraHeaders: { "x-custom": "1" },
    });

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-test",
      baseURL: "https://proxy.example.com/gpt-4o/v1",
      headers: { "x-custom": "1" },
      fetch: baseParams.fetch,
    });
    expect(provider.chat).toHaveBeenCalledWith("gpt-4o");
    expect(provider.responses).not.toHaveBeenCalled();
  });

  it("uses the responses API model in responses mode", async () => {
    mockGenerateText.mockResolvedValue({ text: "hello" } as never);

    await executeAiSdkCompletion({ ...baseParams, apiMode: "responses" });

    expect(provider.responses).toHaveBeenCalledWith("gpt-4o");
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it("maps model params and provider options onto the call", async () => {
    mockGenerateText.mockResolvedValue({ text: "hello" } as never);

    await executeAiSdkCompletion({
      ...baseParams,
      maxRetries: 2,
      translatedProviderOptions: { reasoningEffort: "high" },
    });

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: chatModel,
        maxOutputTokens: 128,
        temperature: 0.2,
        topP: 0.9,
        maxRetries: 2,
        timeout: 5_000,
        // System-first message lists (compiled prompts, playground) throw
        // InvalidPromptError in AI SDK v7 without this opt-in.
        allowSystemInMessages: true,
        providerOptions: { openai: { reasoningEffort: "high" } },
        messages: [{ role: "user", content: "Hi" }],
      }),
    );
  });

  it("returns plain text, and text with reasoning when present", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "hello" } as never);
    await expect(executeAiSdkCompletion(baseParams)).resolves.toBe("hello");

    mockGenerateText.mockResolvedValueOnce({
      text: "hello",
      finalStep: { reasoningText: "because" },
    } as never);
    await expect(executeAiSdkCompletion(baseParams)).resolves.toEqual({
      text: "hello",
      reasoning: "because",
    });
  });

  it("returns the structured output object", async () => {
    mockGenerateText.mockResolvedValue({
      output: { score: 0.7, reasoning: "ok" },
    } as never);

    const result = await executeAiSdkCompletion({
      ...baseParams,
      structuredOutputSchema: z.object({
        score: z.number(),
        reasoning: z.string(),
      }),
    });

    expect(result).toEqual({ score: 0.7, reasoning: "ok" });
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ output: expect.anything() }),
    );
  });

  it("accepts raw JSON schemas for structured output", async () => {
    mockGenerateText.mockResolvedValue({ output: { score: 1 } } as never);

    const result = await executeAiSdkCompletion({
      ...baseParams,
      structuredOutputSchema: {
        type: "object",
        properties: { score: { type: "number" } },
      },
    });

    expect(result).toEqual({ score: 1 });
  });

  it("normalizes tool calls to the ToolCallResponse contract", async () => {
    mockGenerateText.mockResolvedValue({
      text: "calling tool",
      toolCalls: [
        {
          toolName: "get_weather",
          toolCallId: "call_1",
          input: { city: "Berlin" },
        },
      ],
    } as never);

    const result = await executeAiSdkCompletion({
      ...baseParams,
      tools: [
        {
          name: "get_weather",
          description: "Get weather",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
          },
        },
      ],
    });

    expect(result).toEqual({
      content: "calling tool",
      tool_calls: [
        { name: "get_weather", id: "call_1", args: { city: "Berlin" } },
      ],
    });
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ tools: expect.anything() }),
    );
  });

  it("wraps provider errors with the shared retryability classification", async () => {
    mockGenerateText.mockRejectedValueOnce(
      Object.assign(new Error("rate limited"), { statusCode: 429 }),
    );
    await executeAiSdkCompletion(baseParams).then(
      () => expect.unreachable("expected an error"),
      (e) => {
        expect(isLLMCompletionError(e)).toBe(true);
        expect(e.isRetryable).toBe(true);
        expect(e.responseStatusCode).toBe(429);
      },
    );

    mockGenerateText.mockRejectedValueOnce(
      Object.assign(new Error("bad request"), { statusCode: 400 }),
    );
    await executeAiSdkCompletion(baseParams).then(
      () => expect.unreachable("expected an error"),
      (e) => {
        expect(isLLMCompletionError(e)).toBe(true);
        expect(e.isRetryable).toBe(false);
        expect(e.responseStatusCode).toBe(400);
      },
    );
  });

  it("maps the SDK's native timeout abort to the shared non-retryable timeout message", async () => {
    // AbortSignal.timeout (behind the SDK's `timeout` option) aborts with a
    // DOMException named TimeoutError, which the provider fetch surfaces.
    mockGenerateText.mockRejectedValueOnce(
      new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      ),
    );

    await executeAiSdkCompletion({ ...baseParams, timeoutMs: 20 }).then(
      () => expect.unreachable("expected an error"),
      (e) => {
        expect(isLLMCompletionError(e)).toBe(true);
        expect(e.message).toContain("Request timed out after 20ms");
        expect(e.isRetryable).toBe(false);
      },
    );
  });

  it("detects timeout aborts wrapped in provider error cause chains", async () => {
    mockGenerateText.mockRejectedValueOnce(
      Object.assign(new Error("Connection error."), {
        cause: new DOMException(
          "The operation was aborted due to timeout",
          "TimeoutError",
        ),
      }),
    );

    await executeAiSdkCompletion({ ...baseParams, timeoutMs: 20 }).then(
      () => expect.unreachable("expected an error"),
      (e) => {
        expect(isLLMCompletionError(e)).toBe(true);
        expect(e.message).toContain("Request timed out after 20ms");
        expect(e.isRetryable).toBe(false);
      },
    );
  });

  it("streams encoded text chunks", async () => {
    mockStreamText.mockReturnValue({
      textStream: (async function* () {
        yield "Hel";
        yield "lo";
      })(),
    } as never);

    const stream = await executeAiSdkCompletion({
      ...baseParams,
      streaming: true,
    });

    const decoder = new TextDecoder();
    let output = "";
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      output += decoder.decode(chunk);
    }
    expect(output).toBe("Hello");
  });

  it("maps mid-stream timeout aborts to the shared non-retryable timeout message", async () => {
    mockStreamText.mockReturnValue({
      textStream: (async function* () {
        yield "partial";
        throw new DOMException(
          "The operation was aborted due to timeout",
          "TimeoutError",
        );
      })(),
    } as never);

    const stream = await executeAiSdkCompletion({
      ...baseParams,
      streaming: true,
      timeoutMs: 20,
    });

    let consumedBytes = 0;
    await (async () => {
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        consumedBytes += chunk.length;
      }
    })().then(
      () => expect.unreachable("expected an error"),
      (e) => {
        expect(consumedBytes).toBeGreaterThan(0);
        expect(isLLMCompletionError(e)).toBe(true);
        expect(e.message).toContain("Request timed out after 20ms");
        expect(e.isRetryable).toBe(false);
      },
    );
  });

  it("wraps mid-stream errors as LLMCompletionError", async () => {
    mockStreamText.mockReturnValue({
      textStream: (async function* () {
        yield "partial";
        throw Object.assign(new Error("upstream broke"), { statusCode: 500 });
      })(),
    } as never);

    const stream = await executeAiSdkCompletion({
      ...baseParams,
      streaming: true,
    });

    let consumedBytes = 0;
    await (async () => {
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        consumedBytes += chunk.length;
      }
    })().then(
      () => expect.unreachable("expected an error"),
      (e) => {
        expect(consumedBytes).toBeGreaterThan(0);
        expect(isLLMCompletionError(e)).toBe(true);
        expect(e.isRetryable).toBe(true);
      },
    );
  });
});
