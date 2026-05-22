import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { encrypt } from "../../../packages/shared/src/encryption";
import { env } from "../../../packages/shared/src/env";
import {
  ChatMessageType,
  LLMAdapter,
} from "../../../packages/shared/src/server/llm/types";
import { createSecureLlmFetch } from "../../../packages/shared/src/server/llm/secureLlmFetch";
import { fetchLLMCompletion } from "../../../packages/shared/src/server/llm/fetchLLMCompletion";

describe("secure LLM fetch", () => {
  const originalWhitelistedHosts = env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST;
  const originalCloudRegion = process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = ["example.com"];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = originalWhitelistedHosts;
    if (originalCloudRegion === undefined) {
      delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    } else {
      process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    }
  });

  test("fetches through validated URLs and preserves request options", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const secureFetch = createSecureLlmFetch({
      logContext: "Test LLM endpoint",
      additionalSensitiveHeaders: ["x-api-key"],
    });

    await secureFetch("https://example.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": "test-key" },
      body: JSON.stringify({ messages: [] }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ messages: [] }),
        redirect: "manual",
      }),
    );
  });

  test("preserves the caller-provided dispatcher", async () => {
    const dispatcher = {};
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const secureFetch = createSecureLlmFetch({
      logContext: "Test LLM endpoint",
    });

    await secureFetch("https://example.com/v1/messages", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
      dispatcher,
    } as RequestInit);

    const [, requestOptions] = fetchMock.mock.calls[0];
    expect(
      (requestOptions as RequestInit & { dispatcher?: unknown }).dispatcher,
    ).toBe(dispatcher);
  });

  test("uses the configured dispatcher when init does not provide one", async () => {
    const dispatcher = {};
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const secureFetch = createSecureLlmFetch({
      logContext: "Test LLM endpoint",
      dispatcher,
    });

    await secureFetch("https://example.com/v1/messages", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
    });

    const [, requestOptions] = fetchMock.mock.calls[0];
    expect(
      (requestOptions as RequestInit & { dispatcher?: unknown }).dispatcher,
    ).toBe(dispatcher);
  });

  test("supports Request input", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const secureFetch = createSecureLlmFetch({
      logContext: "Test LLM endpoint",
      additionalSensitiveHeaders: ["x-api-key"],
    });

    await secureFetch(
      new Request("https://example.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": "test-key" },
        body: JSON.stringify({ messages: [] }),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ messages: [] }),
        redirect: "manual",
      }),
    );

    const [, requestOptions] = fetchMock.mock.calls[0];
    expect(new Headers(requestOptions?.headers).get("x-api-key")).toBe(
      "test-key",
    );
  });

  test("lets init override Request input options", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const secureFetch = createSecureLlmFetch({
      logContext: "Test LLM endpoint",
      additionalSensitiveHeaders: ["x-api-key"],
    });

    await secureFetch(
      new Request("https://example.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": "request-key" },
        body: JSON.stringify({ source: "request" }),
      }),
      {
        method: "PUT",
        headers: { "x-api-key": "init-key" },
        body: JSON.stringify({ source: "init" }),
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/v1/messages",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ source: "init" }),
        redirect: "manual",
      }),
    );

    const [, requestOptions] = fetchMock.mock.calls[0];
    expect(new Headers(requestOptions?.headers).get("x-api-key")).toBe(
      "init-key",
    );
  });

  test.each([
    {
      providerName: "OpenAI",
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
      model: "gpt-4o-mini",
      secretKey: "openai-api-key",
      baseURL: "https://example.com/v1",
      response: {
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 1,
        model: "gpt-4o-mini",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "4" },
            finish_reason: "stop",
          },
        ],
      },
      expectedUrl: "https://example.com/v1/chat/completions",
    },
    {
      providerName: "Azure OpenAI",
      provider: "azure",
      adapter: LLMAdapter.Azure,
      model: "deployment",
      secretKey: "azure-api-key",
      baseURL: "https://example.com/openai/deployments",
      response: {
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 1,
        model: "deployment",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "4" },
            finish_reason: "stop",
          },
        ],
      },
      expectedUrl:
        "https://example.com/openai/deployments/deployment/chat/completions?api-version=2025-02-01-preview",
    },
    {
      providerName: "Anthropic",
      provider: "anthropic",
      adapter: LLMAdapter.Anthropic,
      model: "claude-sonnet-4-5-20250929",
      secretKey: "anthropic-api-key",
      baseURL: "https://example.com",
      response: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5-20250929",
        content: [{ type: "text", text: "4" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      expectedUrl: "https://example.com/v1/messages",
    },
  ])(
    "fetchLLMCompletion uses secure fetch for $providerName",
    async ({
      provider,
      adapter,
      model,
      secretKey,
      baseURL,
      response,
      expectedUrl,
    }) => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const completion = await fetchLLMCompletion({
        streaming: false,
        messages: [
          {
            role: "user",
            content: "What is 2+2? Answer only with the number.",
            type: ChatMessageType.PublicAPICreated,
          },
        ],
        modelParams: {
          provider,
          adapter,
          model,
          temperature: 0,
          max_tokens: 10,
        },
        llmConnection: {
          secretKey: encrypt(secretKey),
          baseURL,
        },
      });

      expect(completion).toBe("4");
      expect(fetchMock).toHaveBeenCalledWith(
        expectedUrl,
        expect.objectContaining({ redirect: "manual" }),
      );
    },
  );
});
