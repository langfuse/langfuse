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

  test("fetchLLMCompletion uses secure fetch for OpenAI", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
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
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 10,
      },
      llmConnection: {
        secretKey: encrypt("openai-api-key"),
        baseURL: "https://example.com/v1",
      },
    });

    expect(completion).toBe("4");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/v1/chat/completions",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  test("fetchLLMCompletion uses secure fetch for Azure OpenAI", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
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
        provider: "azure",
        adapter: LLMAdapter.Azure,
        model: "deployment",
        temperature: 0,
        max_tokens: 10,
      },
      llmConnection: {
        secretKey: encrypt("azure-api-key"),
        baseURL: "https://example.com/openai/deployments",
      },
    });

    expect(completion).toBe("4");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/openai/deployments/deployment/chat/completions?api-version=2025-02-01-preview",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  test("fetchLLMCompletion uses secure fetch for Anthropic", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-5-20250929",
          content: [{ type: "text", text: "4" }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
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
        provider: "anthropic",
        adapter: LLMAdapter.Anthropic,
        model: "claude-sonnet-4-5-20250929",
        temperature: 0,
        max_tokens: 10,
      },
      llmConnection: {
        secretKey: encrypt("anthropic-api-key"),
        baseURL: "https://example.com",
      },
    });

    expect(completion).toBe("4");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/v1/messages",
      expect.objectContaining({ redirect: "manual" }),
    );
  });
});
