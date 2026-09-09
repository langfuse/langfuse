import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "@langfuse/shared/src/env";
import {
  createInAppAgentLanguageModel,
  getBedrockReasoningProviderOptions,
  getInAppAgentReasoningProviderOptions,
} from "./model";
import { applyPromptCacheToCall } from "./promptCache";

const originalUseResponsesApi = env.LANGFUSE_AI_USE_RESPONSES_API;

beforeEach(() => {
  Object.assign(env, { LANGFUSE_AI_USE_RESPONSES_API: undefined });
});

afterEach(() => {
  Object.assign(env, {
    LANGFUSE_AI_USE_RESPONSES_API: originalUseResponsesApi,
  });
});

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
    const { calls, fetch } = createCaptureFetch(OPENAI_CHAT_RESPONSE);
    vi.stubGlobal("fetch", fetch);

    const model = createInAppAgentLanguageModel({ config });
    await model.doGenerate({
      prompt: userPrompt(),
      providerOptions: getInAppAgentReasoningProviderOptions(config),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://llm-exec.internal/v1/chat/completions");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer sk-test");
    expect(calls[0]?.headers.get("x-llm-exec-token")).toBe("proxy-token");
    expect(calls[0]?.body).not.toHaveProperty("thinking");
    expect(calls[0]?.body.reasoning_effort).toBe("medium");
    expect(calls[0]?.body).not.toHaveProperty("reasoning");
  });

  it("posts Anthropic cache_control on Chat Completions for anthropic model slugs", async () => {
    const config = {
      provider: "openai" as const,
      modelId: "anthropic/claude-opus-4.6",
      titleModelId: "anthropic/claude-haiku-4.5",
      apiKey: "sk-or-test",
      baseURL: "https://openrouter.ai/api/v1",
    };
    const { calls, fetch } = createCaptureFetch(OPENAI_CHAT_RESPONSE);
    vi.stubGlobal("fetch", fetch);

    const model = createInAppAgentLanguageModel({ config });
    const prompt = [
      { role: "system" as const, content: "You are the Langfuse assistant." },
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: "hello" }],
      },
    ];
    await model.doGenerate(
      applyPromptCacheToCall({
        provider: String(model.provider),
        modelId: model.modelId,
        options: { prompt },
      }),
    );

    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0]?.body.messages).toEqual([
      {
        role: "system",
        content: "You are the Langfuse assistant.",
        cache_control: { type: "ephemeral" },
      },
      {
        role: "user",
        content: "hello",
        cache_control: { type: "ephemeral" },
      },
    ]);
  });
});

describe("OpenAI Responses request shape", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts first-party OpenAI calls to the Responses API", async () => {
    const config = {
      provider: "openai" as const,
      modelId: "gpt-5.6-sol",
      titleModelId: "gpt-5.6-luna",
      apiKey: "sk-test",
    };
    const { calls, fetch } = createCaptureFetch(OPENAI_RESPONSES_RESPONSE);
    vi.stubGlobal("fetch", fetch);

    const model = createInAppAgentLanguageModel({ config });
    await model.doGenerate({
      prompt: userPrompt(),
      providerOptions: getInAppAgentReasoningProviderOptions(config),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer sk-test");
    expect(calls[0]?.body.reasoning).toEqual({ summary: "auto" });
    expect(calls[0]?.body).not.toHaveProperty("reasoning_effort");
    expect(calls[0]?.body.store).toBe(false);
    expect(calls[0]?.body.include).toEqual(["reasoning.encrypted_content"]);
  });

  it("posts prompt_cache_breakpoint on Responses input for Claude ids", async () => {
    Object.assign(env, { LANGFUSE_AI_USE_RESPONSES_API: "true" });

    const config = {
      provider: "openai" as const,
      modelId: "claude-opus-5",
      titleModelId: "gpt-5.6-luna",
      apiKey: "sk-test",
      baseURL: "https://llm-gateway.internal/v1",
    };
    const { calls, fetch } = createCaptureFetch(OPENAI_RESPONSES_RESPONSE);
    vi.stubGlobal("fetch", fetch);

    const model = createInAppAgentLanguageModel({ config });
    const prompt = [
      { role: "system" as const, content: "You are the Langfuse assistant." },
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: "hello" }],
      },
    ];
    await model.doGenerate(
      applyPromptCacheToCall({
        provider: String(model.provider),
        modelId: model.modelId,
        options: { prompt },
      }),
    );

    expect(calls[0]?.url).toBe("https://llm-gateway.internal/v1/responses");
    expect(calls[0]?.body.input).toEqual([
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: "You are the Langfuse assistant.",
            prompt_cache_breakpoint: { mode: "explicit" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "hello",
            prompt_cache_breakpoint: { mode: "explicit" },
          },
        ],
      },
    ]);
  });

  it("posts to /v1/responses when a custom URL opts into Responses", async () => {
    Object.assign(env, { LANGFUSE_AI_USE_RESPONSES_API: "true" });

    const config = {
      provider: "openai" as const,
      modelId: "gpt-5.6-sol",
      titleModelId: "gpt-5.6-luna",
      apiKey: "sk-test",
      baseURL: "https://llm-exec.internal/v1",
    };
    const { calls, fetch } = createCaptureFetch(OPENAI_RESPONSES_RESPONSE);
    vi.stubGlobal("fetch", fetch);

    const model = createInAppAgentLanguageModel({ config });
    await model.doGenerate({
      prompt: userPrompt(),
      providerOptions: getInAppAgentReasoningProviderOptions(config),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://llm-exec.internal/v1/responses");
  });

  it("requests summarized reasoning for Claude ids behind a Responses gateway", async () => {
    // @ai-sdk/openai emits `reasoning` only for model ids on its own
    // reasoning-model allowlist. Without `forceReasoning` a Claude id gets no
    // `reasoning`, so a translating gateway leaves thinking at the model
    // default (omitted display: no summary deltas, blank reasoning UI), and
    // the request does not ask for encrypted reasoning to replay on the next
    // tool step.
    Object.assign(env, { LANGFUSE_AI_USE_RESPONSES_API: "true" });

    const config = {
      provider: "openai" as const,
      modelId: "claude-opus-5",
      titleModelId: "gpt-5.6-luna",
      apiKey: "sk-test",
      baseURL: "https://llm-gateway.internal/v1",
    };
    const { calls, fetch } = createCaptureFetch(OPENAI_RESPONSES_RESPONSE);
    vi.stubGlobal("fetch", fetch);

    const model = createInAppAgentLanguageModel({ config });
    await model.doGenerate({
      prompt: [
        { role: "system" as const, content: "You are the Langfuse assistant." },
        ...userPrompt(),
      ],
      providerOptions: getInAppAgentReasoningProviderOptions(config),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.body.reasoning).toEqual({ summary: "auto" });
    expect(calls[0]?.body.store).toBe(false);
    expect(calls[0]?.body.include).toEqual(["reasoning.encrypted_content"]);
    // `systemMessageMode: "system"` keeps the system role.
    expect(calls[0]?.body.input).toEqual([
      { role: "system", content: "You are the Langfuse assistant." },
      { role: "user", content: [{ type: "input_text", text: "hi" }] },
    ]);
  });

  it("does not force reasoning for non-Claude custom model ids", async () => {
    Object.assign(env, { LANGFUSE_AI_USE_RESPONSES_API: "true" });

    const config = {
      provider: "openai" as const,
      modelId: "custom-chat-model",
      titleModelId: "custom-chat-model",
      apiKey: "sk-test",
      baseURL: "https://llm-gateway.internal/v1",
    };
    const { calls, fetch } = createCaptureFetch(OPENAI_RESPONSES_RESPONSE);
    vi.stubGlobal("fetch", fetch);

    const model = createInAppAgentLanguageModel({ config });
    await model.doGenerate({
      prompt: userPrompt(),
      providerOptions: getInAppAgentReasoningProviderOptions(config),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).not.toHaveProperty("reasoning");
    expect(calls[0]?.body.store).toBe(false);
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
      prompt: userPrompt(),
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

const OPENAI_CHAT_RESPONSE = {
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
};

const OPENAI_RESPONSES_RESPONSE = {
  id: "resp_1",
  object: "response",
  created_at: 1,
  status: "completed",
  error: null,
  incomplete_details: null,
  model: "gpt-5.6-sol",
  output: [
    {
      type: "message",
      id: "msg_1",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: "ok", annotations: [] }],
    },
  ],
  usage: {
    input_tokens: 1,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: 1,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 2,
  },
};

function userPrompt() {
  return [
    {
      role: "user" as const,
      content: [{ type: "text" as const, text: "hi" }],
    },
  ];
}

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
