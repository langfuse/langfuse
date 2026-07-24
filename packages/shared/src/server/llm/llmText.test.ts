import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { encrypt } from "../../encryption";
import { LLMValidationError } from "./errors";
import {
  createLLMOutput,
  createLLMToolSet,
  generateLLMText,
  mapLegacyLLMCompletionParams,
  streamLLMText,
} from "./llmText";
import {
  ChatMessageRole,
  ChatMessageType,
  LLMAdapter,
  type ChatMessage,
} from "./types";

vi.mock("@ai-sdk/openai", () => ({ createOpenAI: vi.fn() }));

const messages = [{ role: "user", content: "Hello" }] as const;
const encryptedConnection = { secretKey: encrypt("sk-test") };

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const finishReason = { unified: "stop" as const, raw: "stop" };

function useModel(model: MockLanguageModelV4): void {
  vi.mocked(createOpenAI).mockReturnValue({
    chat: () => model,
    responses: () => model,
  } as never);
}

function openAIOptions() {
  return {
    model: { adapter: LLMAdapter.OpenAI, id: "gpt-4o" },
    connection: encryptedConnection,
    messages: [...messages],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateLLMText", () => {
  it("returns the native text and reasoning result", async () => {
    useModel(
      new MockLanguageModelV4({
        provider: "openai",
        modelId: "gpt-4o",
        doGenerate: {
          content: [
            { type: "reasoning", text: "Think first." },
            { type: "text", text: "Hello there" },
          ],
          finishReason,
          usage: {
            ...usage,
            outputTokens: { total: 3, text: 2, reasoning: 1 },
          },
          warnings: [],
        },
      }),
    );

    const result = await generateLLMText(openAIOptions());

    expect(result.text).toBe("Hello there");
    expect(result.finalStep.reasoningText).toBe("Think first.");
    expect(result.usage).toMatchObject({
      inputTokens: 1,
      outputTokens: 3,
    });
  });

  it("preserves structured-output inference on the native result", async () => {
    useModel(
      new MockLanguageModelV4({
        doGenerate: {
          content: [{ type: "text", text: '{"score":5,"reason":"clear"}' }],
          finishReason,
          usage,
          warnings: [],
        },
      }),
    );
    const output = createLLMOutput(
      z.object({ score: z.number(), reason: z.string() }),
    );

    const result = await generateLLMText({
      ...openAIOptions(),
      output,
    });

    const score: number = result.output.score;
    expect(score).toBe(5);
    expect(result.output.reason).toBe("clear");
  });

  it("returns native typed tool calls without executing tools", async () => {
    useModel(
      new MockLanguageModelV4({
        doGenerate: {
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "get_weather",
              input: '{"city":"Berlin"}',
            },
          ],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage,
          warnings: [],
        },
      }),
    );
    const tools = createLLMToolSet([
      {
        name: "get_weather",
        description: "Get the weather",
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
    ]);

    const result = await generateLLMText({
      ...openAIOptions(),
      tools,
    });

    expect(result.toolCalls).toEqual([
      expect.objectContaining({
        toolCallId: "call-1",
        toolName: "get_weather",
        input: { city: "Berlin" },
      }),
    ]);
    expect(result.toolResults).toEqual([]);
  });

  it("rethrows native AI SDK provider errors unchanged", async () => {
    const providerError = new APICallError({
      message: "Incorrect API key provided",
      url: "https://api.openai.com/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 401,
    });
    useModel(
      new MockLanguageModelV4({
        doGenerate: async () => {
          throw providerError;
        },
      }),
    );

    await expect(generateLLMText(openAIOptions())).rejects.toBe(providerError);
  });

  it("rejects executable tools instead of running an agent loop", async () => {
    const execute = vi.fn();

    await expect(
      generateLLMText({
        ...openAIOptions(),
        tools: {
          dangerous: tool({
            inputSchema: z.object({}),
            execute,
          }),
        },
      }),
    ).rejects.toMatchObject({
      name: "LLMValidationError",
      code: "invalid-request",
      statusCode: 400,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(createOpenAI).not.toHaveBeenCalled();
  });

  it("does not download media URLs", async () => {
    const model = new MockLanguageModelV4({
      supportedUrls: {},
      doGenerate: {
        content: [{ type: "text", text: "should not run" }],
        finishReason,
        usage,
        warnings: [],
      },
    });
    useModel(model);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      generateLLMText({
        ...openAIOptions(),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "file",
                data: new URL(
                  "http://dns-rebind.attacker.example/metadata?token=secret",
                ),
                mediaType: "image/png",
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: "LLMValidationError",
      message:
        "Remote media downloads are not supported on the Langfuse server; use provider-supported URLs or inline data instead",
      code: "invalid-request",
      statusCode: 400,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("rejects model-supported media URLs when AI SDK would download them", async () => {
    const model = new MockLanguageModelV4({
      supportedUrls: { "image/*": [/^https:\/\/cdn\.example\.com\//] },
      doGenerate: {
        content: [{ type: "text", text: "should not run" }],
        finishReason,
        usage,
        warnings: [],
      },
    });
    useModel(model);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      generateLLMText({
        ...openAIOptions(),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "file",
                data: new URL("https://cdn.example.com/image.png"),
                mediaType: "image/png",
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: "LLMValidationError",
      message:
        "Remote media downloads are not supported on the Langfuse server; use provider-supported URLs or inline data instead",
      code: "invalid-request",
      statusCode: 400,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});

describe("streamLLMText", () => {
  it("returns the native AI SDK stream result", async () => {
    useModel(
      new MockLanguageModelV4({
        doStream: {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              controller.enqueue({ type: "text-start", id: "text-1" });
              controller.enqueue({
                type: "text-delta",
                id: "text-1",
                delta: "Hello ",
              });
              controller.enqueue({
                type: "text-delta",
                id: "text-1",
                delta: "there",
              });
              controller.enqueue({ type: "text-end", id: "text-1" });
              controller.enqueue({
                type: "finish",
                finishReason,
                usage,
              });
              controller.close();
            },
          }),
        },
      }),
    );

    const result = await streamLLMText(openAIOptions());
    let streamedText = "";
    for await (const chunk of result.textStream) streamedText += chunk;

    expect(streamedText).toBe("Hello there");
    expect(await result.text).toBe("Hello there");
  });

  it("preserves asynchronous native timeout errors for consumers", async () => {
    const timeoutError = new DOMException(
      "The operation timed out",
      "TimeoutError",
    );
    useModel(
      new MockLanguageModelV4({
        doStream: {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "error", error: timeoutError });
              controller.close();
            },
          }),
        },
      }),
    );
    const onError = vi.fn();
    const result = await streamLLMText({
      ...openAIOptions(),
      timeout: 25,
      onError,
    });

    const parts = [];
    for await (const part of result.stream) parts.push(part);
    const errorPart = parts.find((part) => part.type === "error");

    expect(errorPart).toMatchObject({
      type: "error",
      error: timeoutError,
    });
    expect(onError).toHaveBeenCalledWith({ error: timeoutError });
  });
});

describe("legacy compatibility boundary", () => {
  const legacyMessages: ChatMessage[] = [
    {
      type: ChatMessageType.User,
      role: ChatMessageRole.User,
      content: "Hello",
    },
  ];

  it("translates persisted options into namespaced AI SDK options", () => {
    const mapped = mapLegacyLLMCompletionParams({
      messages: legacyMessages,
      modelParams: {
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        model: "gpt-4o",
        max_tokens: 123,
        top_p: 0.8,
        providerOptions: { reasoning_effort: "high" },
      },
      connection: encryptedConnection,
    });

    expect(mapped).toMatchObject({
      model: { adapter: LLMAdapter.OpenAI, id: "gpt-4o" },
      maxOutputTokens: 123,
      topP: 0.8,
      providerOptions: { openai: { reasoningEffort: "high" } },
    });
    expect(mapped.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("maps Azure OpenAI provider options to the OpenAI namespace", () => {
    const mapped = mapLegacyLLMCompletionParams({
      messages: legacyMessages,
      modelParams: {
        provider: "azure",
        adapter: LLMAdapter.Azure,
        model: "gpt-4o-deployment",
        providerOptions: { reasoning_effort: "high" },
      },
      connection: encryptedConnection,
    });

    expect(mapped.providerOptions).toEqual({
      openai: { reasoningEffort: "high" },
    });
  });

  it.each(["gpt-5.4-mini", "gpt-5.4-nano"])(
    "uses portable non-reasoning defaults for OpenAI %s",
    (model) => {
      const mapped = mapLegacyLLMCompletionParams({
        messages: legacyMessages,
        modelParams: {
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          model,
          providerOptions: { service_tier: "flex" },
        },
        connection: encryptedConnection,
      });

      expect(mapped).toMatchObject({
        reasoning: "none",
        providerOptions: { openai: { serviceTier: "flex" } },
      });
    },
  );

  it("passes unknown OpenAI provider options through for OpenAI-compatible endpoints", () => {
    const mapped = mapLegacyLLMCompletionParams({
      messages: legacyMessages,
      modelParams: {
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        model: "openai-compatible-reasoning-model",
        providerOptions: {
          reasoning_effort: "high",
          service_tier: "flex",
          parallel_tool_calls: false,
          thinkingBudget: 1024,
          thinkingLevel: "high",
        },
      },
      connection: {
        ...encryptedConnection,
        baseURL: "https://openai-compatible.example.com/v1",
      },
    });

    expect(mapped.providerOptions).toEqual({
      openai: {
        reasoningEffort: "high",
        service_tier: "flex",
        parallel_tool_calls: false,
        thinkingBudget: 1024,
        thinkingLevel: "high",
      },
    });
  });

  it("keeps strict OpenAI option handling for Responses API custom base URLs", () => {
    expect(() =>
      mapLegacyLLMCompletionParams({
        messages: legacyMessages,
        modelParams: {
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          model: "gpt-4o",
          providerOptions: { thinkingBudget: 1024 },
        },
        connection: {
          ...encryptedConnection,
          baseURL: "https://openai-proxy.example.com/v1",
          config: { useResponsesApi: true },
        },
      }),
    ).toThrow(
      expect.objectContaining<Partial<LLMValidationError>>({
        name: "LLMValidationError",
        statusCode: 400,
        code: "invalid-request",
      }),
    );
  });

  it("keeps rejecting unknown OpenAI provider options for first-party OpenAI", () => {
    expect(() =>
      mapLegacyLLMCompletionParams({
        messages: legacyMessages,
        modelParams: {
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          model: "gpt-4o",
          providerOptions: { thinkingBudget: 1024 },
        },
        connection: {
          ...encryptedConnection,
          baseURL: "https://api.openai.com/v1",
        },
      }),
    ).toThrow(
      expect.objectContaining<Partial<LLMValidationError>>({
        name: "LLMValidationError",
        statusCode: 400,
        code: "invalid-request",
      }),
    );
  });

  it("rejects options that cannot be translated instead of falling back", () => {
    expect(() =>
      mapLegacyLLMCompletionParams({
        messages: legacyMessages,
        modelParams: {
          provider: "anthropic",
          adapter: LLMAdapter.Anthropic,
          model: "claude-sonnet-5",
          providerOptions: { unknown_parameter: true },
        },
        connection: encryptedConnection,
      }),
    ).toThrow(
      expect.objectContaining<Partial<LLMValidationError>>({
        name: "LLMValidationError",
        statusCode: 400,
        code: "invalid-request",
      }),
    );
  });

  it("rejects invalid connections and unsupported managed credentials", async () => {
    await expect(
      generateLLMText({
        model: { adapter: LLMAdapter.Azure, id: "deployment" },
        connection: encryptedConnection,
        messages: [...messages],
      }),
    ).rejects.toMatchObject({
      name: "LLMValidationError",
      statusCode: 400,
      code: "invalid-connection",
    });

    await expect(
      generateLLMText({
        ...openAIOptions(),
        credentialSource: "langfuse",
      }),
    ).rejects.toMatchObject({
      name: "LLMValidationError",
      message: "Langfuse credentials are only supported for Amazon Bedrock",
      statusCode: 400,
      code: "invalid-connection",
    });
  });
});
