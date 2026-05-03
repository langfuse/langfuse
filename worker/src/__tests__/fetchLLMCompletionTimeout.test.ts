import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const streamMock = vi.fn();
const bedrockInvokeMock = vi.fn();
const chatVertexAIConstructorMock = vi.fn().mockImplementation(function () {
  return {
    invoke: invokeMock,
    pipe: vi.fn().mockReturnValue({
      stream: streamMock,
    }),
  };
});
const chatBedrockConverseConstructorMock = vi
  .fn()
  .mockImplementation(function () {
    return {
      invoke: bedrockInvokeMock,
      pipe: vi.fn().mockReturnValue({
        invoke: bedrockInvokeMock,
        stream: streamMock,
      }),
    };
  });
const VERTEXAI_USE_DEFAULT_CREDENTIALS = "__VERTEXAI_DEFAULT_CREDENTIALS__";

process.env.CLICKHOUSE_URL ??= "http://localhost:8123";
process.env.CLICKHOUSE_USER ??= "default";
process.env.CLICKHOUSE_PASSWORD ??= "password";
process.env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET ??= "test-bucket";
process.env.ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

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

describe("fetchLLMCompletion runtime timeouts", () => {
  let originalTimeout: number;
  let originalCloudRegion: string | undefined;
  let env: typeof import("../../../packages/shared/src/env").env;
  let encrypt: typeof import("../../../packages/shared/src/encryption").encrypt;
  let fetchLLMCompletion: typeof import("../../../packages/shared/src/server/llm/fetchLLMCompletion").fetchLLMCompletion;

  beforeEach(async () => {
    vi.useFakeTimers();
    invokeMock.mockReset();
    streamMock.mockReset();
    chatVertexAIConstructorMock.mockClear();
    vi.resetModules();
    originalCloudRegion = process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    vi.doMock("@langchain/google-vertexai", () => ({
      ChatVertexAI: chatVertexAIConstructorMock,
    }));
    vi.doMock("../../../packages/shared/src/server/llm/errors", () => ({
      LLMCompletionError: MockLLMCompletionError,
    }));

    ({ env } = await import("../../../packages/shared/src/env"));
    ({ encrypt } = await import("../../../packages/shared/src/encryption"));
    ({ fetchLLMCompletion } =
      await import("../../../packages/shared/src/server/llm/fetchLLMCompletion"));

    originalTimeout = env.LANGFUSE_FETCH_LLM_COMPLETION_TIMEOUT_MS;
  });

  afterEach(() => {
    env.LANGFUSE_FETCH_LLM_COMPLETION_TIMEOUT_MS = originalTimeout;
    if (originalCloudRegion === undefined) {
      delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    } else {
      process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    }
    vi.useRealTimers();
  });

  it("wraps non-streaming VertexAI timeouts as non-retryable LLMCompletionError", async () => {
    env.LANGFUSE_FETCH_LLM_COMPLETION_TIMEOUT_MS = 25;

    invokeMock.mockImplementation(() => new Promise(() => {}));

    const completionPromise = fetchLLMCompletion({
      streaming: false,
      messages: [
        {
          role: "user",
          content: "What is 2+2? Answer only with the number.",
          type: "public-api-created",
        },
      ],
      modelParams: {
        provider: "google-vertex-ai",
        adapter: "google-vertex-ai",
        model: "gemini-2.0-flash",
        temperature: 0,
        max_tokens: 10,
      },
      llmConnection: {
        secretKey: encrypt(VERTEXAI_USE_DEFAULT_CREDENTIALS),
        config: null,
      },
    });

    const completionRejection = expect(completionPromise).rejects.toMatchObject(
      {
        name: "LLMCompletionError",
        message: "Request timed out after 25ms",
        isRetryable: false,
      },
    );

    await vi.runOnlyPendingTimersAsync();
    await completionRejection;
  });

  it("wraps streaming VertexAI timeouts as non-retryable LLMCompletionError", async () => {
    env.LANGFUSE_FETCH_LLM_COMPLETION_TIMEOUT_MS = 25;

    streamMock.mockImplementation(() => new Promise(() => {}));

    const completionPromise = fetchLLMCompletion({
      streaming: true,
      messages: [
        {
          role: "user",
          content: "Stream the answer.",
          type: "public-api-created",
        },
      ],
      modelParams: {
        provider: "google-vertex-ai",
        adapter: "google-vertex-ai",
        model: "gemini-2.0-flash",
        temperature: 0,
        max_tokens: 10,
      },
      llmConnection: {
        secretKey: encrypt(VERTEXAI_USE_DEFAULT_CREDENTIALS),
        config: null,
      },
    });

    const completionRejection = expect(completionPromise).rejects.toMatchObject(
      {
        name: "LLMCompletionError",
        message: "Request timed out after 25ms",
        isRetryable: false,
      },
    );

    await vi.runOnlyPendingTimersAsync();
    await completionRejection;
  });
});

describe("fetchLLMCompletion end of model lifetime", () => {
  let originalCloudRegion: string | undefined;
  let encrypt: typeof import("../../../packages/shared/src/encryption").encrypt;
  let fetchLLMCompletion: typeof import("../../../packages/shared/src/server/llm/fetchLLMCompletion").fetchLLMCompletion;
  let ResourceNotFoundException: any;

  beforeEach(async () => {
    invokeMock.mockReset();
    streamMock.mockReset();
    bedrockInvokeMock.mockReset();
    chatBedrockConverseConstructorMock.mockClear();
    vi.resetModules();
    originalCloudRegion = process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    // @langchain/aws is a dependency of @langfuse/shared, not worker — a bare
    // specifier can't resolve from this test file under pnpm strict isolation.
    vi.doMock("../../../packages/shared/node_modules/@langchain/aws", () => ({
      ChatBedrockConverse: chatBedrockConverseConstructorMock,
    }));
    vi.doMock("../../../packages/shared/src/server/llm/errors", () => ({
      LLMCompletionError: MockLLMCompletionError,
    }));

    ({ encrypt } = await import("../../../packages/shared/src/encryption"));
    ({ fetchLLMCompletion } =
      await import("../../../packages/shared/src/server/llm/fetchLLMCompletion"));

    // Resolve the real AWS SDK exception via @langchain/aws's dependency tree.
    const awsModulePath = require.resolve("@langchain/aws", {
      paths: [require("path").resolve(__dirname, "../../../packages/shared")],
    });
    ({ ResourceNotFoundException } = await import(
      require.resolve("@aws-sdk/client-bedrock-runtime", {
        paths: [require("path").dirname(awsModulePath)],
      })
    ));
  });

  afterEach(() => {
    if (originalCloudRegion === undefined) {
      delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    } else {
      process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    }
  });

  it("treats end-of-life model errors as non-retryable", async () => {
    const endOfLifeError = new ResourceNotFoundException({
      message:
        "This model version has reached the end of its life. Please refer to the AWS documentation for more details.",
      $metadata: { httpStatusCode: 404 },
    });
    bedrockInvokeMock.mockRejectedValue(endOfLifeError);

    const completionPromise = fetchLLMCompletion({
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
        model: "anthropic.claude-3-5-sonnet-20240620-v1:0",
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

    expect(chatBedrockConverseConstructorMock).toHaveBeenCalled();

    await expect(completionPromise).rejects.toMatchObject({
      name: "LLMCompletionError",
      message:
        "This model version has reached the end of its life. Please refer to the AWS documentation for more details.",
      responseStatusCode: 404,
      isRetryable: false,
    });
  });
});
