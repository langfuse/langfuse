import { beforeEach, describe, expect, it, vi } from "vitest";

const anthropicInvokeMock = vi.fn();
const chatAnthropicConstructorMock = vi.fn().mockImplementation(function () {
  return {
    invoke: anthropicInvokeMock,
    pipe: vi.fn().mockReturnValue({
      invoke: anthropicInvokeMock,
    }),
    withStructuredOutput: vi.fn().mockReturnValue({
      invoke: anthropicInvokeMock,
    }),
  };
});

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

describe("fetchLLMCompletion provider error classification", () => {
  let encrypt: typeof import("../../../packages/shared/src/encryption").encrypt;
  let fetchLLMCompletion: typeof import("../../../packages/shared/src/server/llm/fetchLLMCompletion").fetchLLMCompletion;

  beforeEach(async () => {
    anthropicInvokeMock.mockReset();
    chatAnthropicConstructorMock.mockClear();
    vi.resetModules();

    vi.doMock(
      "../../../packages/shared/node_modules/@langchain/anthropic",
      () => ({
        ChatAnthropic: chatAnthropicConstructorMock,
      }),
    );
    vi.doMock("../../../packages/shared/src/server/llm/errors", () => ({
      LLMCompletionError: MockLLMCompletionError,
    }));

    ({ encrypt } = await import("../../../packages/shared/src/encryption"));
    ({ fetchLLMCompletion } =
      await import("../../../packages/shared/src/server/llm/fetchLLMCompletion"));
  });

  it("treats wrapped Anthropic context overflow errors as non-retryable", async () => {
    const { ContextOverflowError } =
      await import("../../../packages/shared/node_modules/@langchain/core/errors");
    const cause = new Error(
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 202089 tokens > 200000 maximum"},"request_id":"req_123"}',
    );
    (cause as Error & { status: number }).status = 400;

    const contextOverflowError = ContextOverflowError.fromError(cause);

    anthropicInvokeMock.mockRejectedValue(contextOverflowError);

    await expect(
      fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "Score this observation.",
            type: "public-api-created",
          },
        ],
        modelParams: {
          provider: "anthropic",
          adapter: "anthropic",
          model: "claude-haiku-4-5-20251001",
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt("anthropic-api-key"),
        },
      }),
    ).rejects.toMatchObject({
      name: "LLMCompletionError",
      responseStatusCode: 400,
      isRetryable: false,
    });
  });

  it("preserves provider status codes from wrapped error causes", async () => {
    const cause = new Error("Provider authentication failed");
    (cause as Error & { status: number }).status = 401;
    const wrappedError = new Error("Connection error.", { cause });

    anthropicInvokeMock.mockRejectedValue(wrappedError);

    await expect(
      fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "Score this observation.",
            type: "public-api-created",
          },
        ],
        modelParams: {
          provider: "anthropic",
          adapter: "anthropic",
          model: "claude-haiku-4-5-20251001",
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt("anthropic-api-key"),
        },
      }),
    ).rejects.toMatchObject({
      name: "LLMCompletionError",
      responseStatusCode: 401,
      isRetryable: false,
    });
  });
});
