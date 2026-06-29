import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const streamMock = vi.fn();
const pipeMock = vi.fn().mockImplementation((parser) => ({
  invoke: invokeMock,
  stream: (...args: any[]) => parser.transform(streamMock(...args), {}),
}));
const bindToolsInvokeMock = vi.fn();
const bindToolsMock = vi.fn().mockReturnValue({
  invoke: bindToolsInvokeMock,
});
const chatBedrockConverseConstructorMock = vi
  .fn()
  .mockImplementation(function () {
    return {
      invoke: invokeMock,
      bindTools: bindToolsMock,
      pipe: pipeMock,
    };
  });

class MockLLMCompletionError extends Error {
  responseStatusCode: number;
  isRetryable: boolean;
  blockReason: null;

  constructor(params: {
    message: string;
    responseStatusCode?: number;
    isRetryable?: boolean;
  }) {
    super(params.message);
    this.name = "LLMCompletionError";
    this.responseStatusCode = params.responseStatusCode ?? 500;
    this.isRetryable = params.isRetryable ?? false;
    this.blockReason = null;
  }

  shouldBlockConfig() {
    return false;
  }

  getEvaluatorBlockReason() {
    return null;
  }
}

process.env.CLICKHOUSE_URL ??= "http://localhost:8123";
process.env.CLICKHOUSE_USER ??= "default";
process.env.CLICKHOUSE_PASSWORD ??= "password";
process.env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET ??= "test-bucket";
process.env.ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("fetchLLMCompletion Bedrock reasoning blocks", () => {
  let originalCloudRegion: string | undefined;
  let encrypt: typeof import("../../../packages/shared/src/encryption").encrypt;
  let fetchLLMCompletion: typeof import("../../../packages/shared/src/server/llm/fetchLLMCompletion").fetchLLMCompletion;

  beforeEach(async () => {
    invokeMock.mockReset();
    streamMock.mockReset();
    pipeMock.mockClear();
    bindToolsInvokeMock.mockReset();
    bindToolsMock.mockClear();
    chatBedrockConverseConstructorMock.mockClear();
    vi.resetModules();
    originalCloudRegion = process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    vi.doMock("../../../packages/shared/node_modules/@langchain/aws", () => ({
      ChatBedrockConverse: chatBedrockConverseConstructorMock,
    }));
    vi.doMock("../../../packages/shared/src/server/llm/errors", () => ({
      LLMCompletionError: MockLLMCompletionError,
    }));

    ({ encrypt } = await import("../../../packages/shared/src/encryption"));
    ({ fetchLLMCompletion } =
      await import("../../../packages/shared/src/server/llm/fetchLLMCompletion"));
  });

  afterEach(() => {
    if (originalCloudRegion === undefined) {
      delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    } else {
      process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    }
  });

  it("preserves plain string completions when Bedrock returns no reasoning", async () => {
    invokeMock.mockResolvedValue({
      content: "4",
    });

    const completion = await fetchLLMCompletion({
      streaming: false,
      messages: [
        {
          role: "user",
          content: "What is 2+2? Answer only with the number.",
          type: "public-api-created",
        },
      ],
      modelParams: {
        provider: "bedrock",
        adapter: "bedrock",
        model: "openai.gpt-oss-120b-1:0",
        temperature: 0,
        max_tokens: 10,
      },
      llmConnection: {
        secretKey: encrypt(JSON.stringify({ apiKey: "test-api-key" })),
        config: {
          region: "us-east-1",
        },
      },
    });

    expect(completion).toBe("4");
  });

  it("returns Bedrock GPT OSS reasoning separately from text", async () => {
    invokeMock.mockResolvedValue({
      content: [
        {
          type: "reasoning_content",
          reasoningText: { text: "Compute the arithmetic." },
        },
        { type: "text", text: "4" },
      ],
    });

    const completion = await fetchLLMCompletion({
      streaming: false,
      messages: [
        {
          role: "user",
          content: "What is 2+2? Answer only with the number.",
          type: "public-api-created",
        },
      ],
      modelParams: {
        provider: "bedrock",
        adapter: "bedrock",
        model: "openai.gpt-oss-120b-1:0",
        temperature: 0,
        max_tokens: 10,
      },
      llmConnection: {
        secretKey: encrypt(JSON.stringify({ apiKey: "test-api-key" })),
        config: {
          region: "us-east-1",
        },
      },
    });

    expect(completion).toEqual({
      text: "4",
      reasoning: "Compute the arithmetic.",
    });
  });

  it("strips Bedrock reasoning blocks before parsing tool calls", async () => {
    bindToolsInvokeMock.mockResolvedValue({
      content: [
        {
          type: "reasoning_content",
          reasoningText: { text: "Need the weather tool." },
        },
        { type: "text", text: "" },
      ],
      tool_calls: [
        {
          id: "tool-use-1",
          name: "get_weather",
          args: { location: "Paris" },
        },
      ],
    });

    const completion = await fetchLLMCompletion({
      streaming: false,
      messages: [
        {
          role: "user",
          content: "What's the weather like in Paris?",
          type: "public-api-created",
        },
      ],
      modelParams: {
        provider: "bedrock",
        adapter: "bedrock",
        model: "openai.gpt-oss-120b-1:0",
        temperature: 0,
        max_tokens: 100,
      },
      tools: [
        {
          name: "get_weather",
          description: "Get the current weather for a location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" },
            },
            required: ["location"],
          },
        },
      ],
      llmConnection: {
        secretKey: encrypt(JSON.stringify({ apiKey: "test-api-key" })),
        config: {
          region: "us-east-1",
        },
      },
    });

    expect(completion).toEqual({
      content: [{ type: "text", text: "" }],
      tool_calls: [
        {
          id: "tool-use-1",
          name: "get_weather",
          args: { location: "Paris" },
        },
      ],
      reasoning: "Need the weather tool.",
    });
  });

  it("filters Bedrock reasoning blocks out of streaming output", async () => {
    streamMock.mockImplementation(async function* () {
      yield {
        content: [
          {
            type: "reasoning_content",
            reasoningText: { text: "Do not show this in the playground." },
          },
        ],
      };
      yield {
        content: [{ type: "text", text: "Hello!" }],
      };
    } as any);

    const stream = await fetchLLMCompletion({
      streaming: true,
      messages: [
        {
          role: "user",
          content: "hi",
          type: "public-api-created",
        },
      ],
      modelParams: {
        provider: "bedrock",
        adapter: "bedrock",
        model: "openai.gpt-oss-120b-1:0",
        temperature: 0,
        max_tokens: 100,
      },
      llmConnection: {
        secretKey: encrypt(JSON.stringify({ apiKey: "test-api-key" })),
        config: {
          region: "us-east-1",
        },
      },
    });

    const decoder = new TextDecoder();
    let text = "";
    for await (const chunk of stream) {
      text += decoder.decode(chunk);
    }

    expect(text).toBe("Hello!");
  });
});
