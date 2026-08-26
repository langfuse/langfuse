import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createInAppAgentLanguageModel,
  getBedrockReasoningProviderOptions,
  getInAppAgentReasoningProviderOptions,
} from "./model";

describe("getBedrockReasoningProviderOptions", () => {
  it("sends adaptive thinking with medium effort and summarized display to Claude models", () => {
    // Adaptive thinking is the default for every Claude model, including
    // unrecognized future generations, so no model list needs maintenance.
    // The config must go through additionalModelRequestFields, not
    // reasoningConfig — @ai-sdk/amazon-bedrock overwrites
    // additionalModelRequestFields.thinking when reasoningConfig is set,
    // which would silently drop the summarized display and blank the
    // reasoning UI.
    for (const modelId of [
      "eu.anthropic.claude-opus-4-8",
      "us.anthropic.claude-sonnet-5",
      "eu.anthropic.claude-fable-5",
      "anthropic.claude-sonnet-6-20270101-v1:0",
    ]) {
      expect(getBedrockReasoningProviderOptions(modelId)).toEqual({
        bedrock: {
          additionalModelRequestFields: {
            thinking: { type: "adaptive", display: "summarized" },
            output_config: { effort: "medium" },
          },
        },
      });
    }
  });

  it("sends no thinking config for non-Claude models", () => {
    expect(
      getBedrockReasoningProviderOptions("meta.llama3-70b-instruct-v1:0"),
    ).toBeUndefined();
  });
});

describe("getInAppAgentReasoningProviderOptions", () => {
  it("sends Anthropic adaptive thinking for Claude model ids", () => {
    expect(
      getInAppAgentReasoningProviderOptions({
        provider: "anthropic",
        modelId: "claude-opus-4-8",
        titleModelId: "claude-haiku-4-5",
        apiKey: "sk-ant-test",
      }),
    ).toEqual({
      anthropic: {
        thinking: { type: "adaptive", display: "summarized" },
      },
    });
  });

  it("sends no thinking config for OpenAI", () => {
    expect(
      getInAppAgentReasoningProviderOptions({
        provider: "openai",
        modelId: "gpt-5.6-sol",
        titleModelId: "gpt-5.6-luna",
        apiKey: "sk-test",
      }),
    ).toBeUndefined();
  });
});

describe("OpenAI Chat Completions request shape", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends Bearer plus additive extra headers to Chat Completions", async () => {
    const config = {
      provider: "openai" as const,
      modelId: "gpt-5.6-sol",
      titleModelId: "gpt-5.6-luna",
      apiKey: "sk-test",
      baseURL: "https://llm-exec.internal/v1",
      extraHeaders: { "X-LLM-Exec-Token": "proxy-token" },
    };
    const { calls, fetch } = createCaptureFetch({
      id: "chatcmpl-1",
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
    vi.stubGlobal("fetch", fetch);

    const model = createInAppAgentLanguageModel({ config });
    await model.doGenerate({
      prompt: [
        {
          role: "user",
          content: [{ type: "text", text: "hi" }],
        },
      ],
      providerOptions: getInAppAgentReasoningProviderOptions(config),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://llm-exec.internal/v1/chat/completions");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer sk-test");
    expect(calls[0]?.headers.get("x-llm-exec-token")).toBe("proxy-token");
    expect(calls[0]?.body).not.toHaveProperty("thinking");
  });
});

describe("Anthropic Messages request shape", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("puts adaptive summarized thinking on the Messages request body", async () => {
    // Older @ai-sdk/anthropic pins accepted thinking.type=adaptive but
    // stripped display from the wire body, so Opus omitted summaries and
    // the UI dropped empty completed thinking blocks. Capture the real
    // SDK request instead of asserting the helper object we pass in.
    const config = {
      provider: "anthropic" as const,
      modelId: "claude-opus-4-8",
      titleModelId: "claude-haiku-4-5",
      apiKey: "sk-ant-test",
      baseURL: "https://anthropic.test/v1",
    };
    const { calls, fetch } = createCaptureFetch({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: config.modelId,
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    vi.stubGlobal("fetch", fetch);

    const model = createInAppAgentLanguageModel({ config });
    await model.doGenerate({
      prompt: [
        {
          role: "user",
          content: [{ type: "text", text: "hi" }],
        },
      ],
      providerOptions: getInAppAgentReasoningProviderOptions(config),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://anthropic.test/v1/messages");
    expect(calls[0]?.body.thinking).toEqual({
      type: "adaptive",
      display: "summarized",
    });
  });
});

function createCaptureFetch(response: unknown) {
  const calls: Array<{
    url: string;
    body: Record<string, unknown>;
    headers: Headers;
  }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    calls.push({
      url: request.url,
      body: JSON.parse(await request.text()) as Record<string, unknown>,
      headers: request.headers,
    });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetch: fetchImpl };
}
