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

const mockGcpServiceAccountKey = {
  type: "service_account",
  project_id: "test-project",
  private_key_id: "test-key-id",
  private_key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
  client_email: "test@test-project.iam.gserviceaccount.com",
  client_id: "1234567890",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url:
    "https://www.googleapis.com/robot/v1/metadata/x509/test%40test-project.iam.gserviceaccount.com",
} as const;

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

  it("forwards Anthropic options and normalizes sampling params for Claude on Vertex", async () => {
    const modelInstance = {
      topP: -1,
      temperature: 0,
      invoke: anthropicInvokeMock,
      pipe: vi.fn().mockReturnValue({
        invoke: anthropicInvokeMock,
      }),
      withStructuredOutput: vi.fn().mockReturnValue({
        invoke: anthropicInvokeMock,
      }),
    };

    chatAnthropicConstructorMock.mockImplementationOnce(function () {
      return modelInstance;
    });
    anthropicInvokeMock.mockResolvedValue({ content: "ok" });

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
          provider: "vertexai",
          adapter: "google-vertex-ai",
          model: "claude-sonnet-4-6",
          temperature: 0,
          max_tokens: 10,
          providerOptions: {
            thinking: {
              type: "enabled",
              budget_tokens: 16000,
            },
          },
        },
        llmConnection: {
          secretKey: encrypt(JSON.stringify(mockGcpServiceAccountKey)),
          config: {
            location: "us-east5",
          },
        },
      }),
    ).resolves.toEqual({ text: "ok" });

    expect(chatAnthropicConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-6",
        temperature: 0,
        topP: undefined,
        invocationKwargs: {
          thinking: {
            type: "enabled",
            budget_tokens: 16000,
          },
        },
      }),
    );
    expect(modelInstance.topP).toBeUndefined();
    expect(modelInstance.temperature).toBe(0);
  });

  it("applies the adaptive thinking structured output workaround for Claude on Vertex", async () => {
    const thinkingDuringStructuredOutput: unknown[] = [];
    const modelInstance = {
      thinking: { type: "disabled" },
      invoke: anthropicInvokeMock,
      pipe: vi.fn().mockReturnValue({
        invoke: anthropicInvokeMock,
      }),
      withStructuredOutput: vi.fn().mockImplementation(function () {
        thinkingDuringStructuredOutput.push(modelInstance.thinking);
        return {
          invoke: anthropicInvokeMock,
        };
      }),
    };

    chatAnthropicConstructorMock.mockImplementationOnce(function () {
      return modelInstance;
    });
    anthropicInvokeMock.mockResolvedValue({ result: "ok" });

    await expect(
      fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "Return structured output.",
            type: "public-api-created",
          },
        ],
        modelParams: {
          provider: "vertexai",
          adapter: "google-vertex-ai",
          model: "claude-fable-5",
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(JSON.stringify(mockGcpServiceAccountKey)),
          config: {
            location: "us-east5",
          },
        },
        structuredOutputSchema: {
          type: "object",
          properties: {
            result: { type: "string" },
          },
          required: ["result"],
          additionalProperties: false,
        },
      }),
    ).resolves.toEqual({ result: "ok" });

    expect(thinkingDuringStructuredOutput).toEqual([{ type: "adaptive" }]);
    expect(modelInstance.thinking).toEqual({ type: "disabled" });
  });

  it("rejects Claude on Vertex model names that are not single path segments", async () => {
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
          provider: "vertexai",
          adapter: "google-vertex-ai",
          model:
            "../../../../../../../projects/victim/locations/us-east5/publishers/anthropic/models/claude-3-5-sonnet",
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(JSON.stringify(mockGcpServiceAccountKey)),
          config: {
            location: "us-east5",
          },
        },
      }),
    ).rejects.toThrow(
      "Invalid Anthropic Vertex AI model name. Model names must be a single Vertex model ID segment.",
    );

    expect(chatAnthropicConstructorMock).not.toHaveBeenCalled();
  });
});
