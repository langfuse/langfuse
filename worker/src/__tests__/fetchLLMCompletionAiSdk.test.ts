import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  startLocalLlmServer,
  type LocalLlmServer,
} from "./helpers/localLlmServer";

process.env.CLICKHOUSE_URL ??= "http://localhost:8123";
process.env.CLICKHOUSE_USER ??= "default";
process.env.CLICKHOUSE_PASSWORD ??= "password";
process.env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET ??= "test-bucket";
process.env.ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const TEST_MODEL = "gpt-4o-mini";

function chatCompletionResponse(params: {
  content?: string | null;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
}) {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1,
    model: TEST_MODEL,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: params.content ?? null,
          ...(params.toolCalls
            ? {
                tool_calls: params.toolCalls.map((toolCall) => ({
                  id: toolCall.id,
                  type: "function",
                  function: {
                    name: toolCall.name,
                    arguments: toolCall.arguments,
                  },
                })),
              }
            : {}),
        },
        finish_reason: params.toolCalls ? "tool_calls" : "stop",
      },
    ],
    usage: {
      prompt_tokens: 3,
      completion_tokens: 2,
      total_tokens: 5,
    },
  };
}

function responsesApiResponse(content: string) {
  return {
    id: "resp_test",
    object: "response",
    created_at: 1,
    status: "completed",
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model: TEST_MODEL,
    output: [
      {
        id: "msg_test",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: content,
            annotations: [],
          },
        ],
      },
    ],
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: null,
    store: true,
    temperature: 0,
    text: { format: { type: "text" } },
    tool_choice: "auto",
    tools: [],
    top_p: 1,
    truncation: "disabled",
    usage: {
      input_tokens: 3,
      output_tokens: 2,
      total_tokens: 5,
    },
    user: null,
    metadata: {},
  };
}

describe("fetchLLMCompletion AI SDK executor", () => {
  let env: typeof import("../../../packages/shared/src/env").env;
  let encrypt: typeof import("../../../packages/shared/src/encryption").encrypt;
  let fetchLLMCompletion: typeof import("../../../packages/shared/src/server/llm/fetchLLMCompletion").fetchLLMCompletion;
  let resolveLlmExecutionDecision: typeof import("../../../packages/shared/src/server/llm/ai-sdk/resolveLlmExecutionDecision").resolveLlmExecutionDecision;
  let ChatMessageType: typeof import("../../../packages/shared/src/server/llm/types").ChatMessageType;
  let LLMAdapter: typeof import("../../../packages/shared/src/server/llm/types").LLMAdapter;
  let originalEnabledAdapters: string[];
  let originalWhitelistedHosts: string[];
  let originalCloudRegion: string | undefined;

  const servers: LocalLlmServer[] = [];

  beforeEach(async () => {
    vi.resetModules();

    ({ env } = await import("../../../packages/shared/src/env"));
    ({ encrypt } = await import("../../../packages/shared/src/encryption"));
    ({ ChatMessageType, LLMAdapter } =
      await import("../../../packages/shared/src/server/llm/types"));
    ({ resolveLlmExecutionDecision } =
      await import("../../../packages/shared/src/server/llm/ai-sdk/resolveLlmExecutionDecision"));

    originalEnabledAdapters = [...env.LANGFUSE_LLM_COMPLETION_AI_SDK_ADAPTERS];
    originalWhitelistedHosts = [
      ...env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST,
    ];
    originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

    env.LANGFUSE_LLM_COMPLETION_AI_SDK_ADAPTERS = ["openai"];
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = ["127.0.0.1"];
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    ({ fetchLLMCompletion } =
      await import("../../../packages/shared/src/server/llm/fetchLLMCompletion"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(servers.splice(0).map((server) => server.close()));

    env.LANGFUSE_LLM_COMPLETION_AI_SDK_ADAPTERS = originalEnabledAdapters;
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = originalWhitelistedHosts;
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  });

  async function spinUp(handler: Parameters<typeof startLocalLlmServer>[0]) {
    const server = await startLocalLlmServer(handler);
    servers.push(server);
    return server;
  }

  function baseModelParams(
    overrides: Partial<
      import("../../../packages/shared/src/server/llm/types").ModelParams
    > = {},
  ): import("../../../packages/shared/src/server/llm/types").ModelParams {
    return {
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
      model: TEST_MODEL,
      temperature: 0.2,
      max_tokens: 64,
      top_p: 0.9,
      ...overrides,
    };
  }

  function userMessage(content = "What is 2+2?") {
    return {
      role: "user" as const,
      content,
      type: ChatMessageType.PublicAPICreated,
    };
  }

  it("routes enabled OpenAI chat completions through the AI SDK executor", async () => {
    const server = await spinUp((_req, _body, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(chatCompletionResponse({ content: "chat-ok" })));
    });

    const completion = await fetchLLMCompletion({
      streaming: false,
      messages: [userMessage()],
      modelParams: baseModelParams({
        providerOptions: {
          reasoning_effort: "low",
          seed: 42,
          store: true,
          user: "test-user",
          max_completion_tokens: 32,
        },
      }),
      llmConnection: {
        secretKey: encrypt("openai-api-key"),
        extraHeaders: encrypt(JSON.stringify({ "x-test-header": "enabled" })),
        baseURL: `${server.url}/{model}/v1`,
      },
      maxRetries: 1,
    });

    expect(completion).toBe("chat-ok");
    expect(server.requests).toHaveLength(1);
    const [request] = server.requests;
    expect(request.method).toBe("POST");
    expect(request.url).toBe(`/${TEST_MODEL}/v1/chat/completions`);
    expect(request.headers.authorization).toBe("Bearer openai-api-key");
    expect(request.headers["x-test-header"]).toBe("enabled");

    const body = JSON.parse(request.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: TEST_MODEL,
      temperature: 0.2,
      top_p: 0.9,
      seed: 42,
      store: true,
      user: "test-user",
      reasoning_effort: "low",
      max_completion_tokens: 32,
    });
  });

  it("routes OpenAI Responses API config through the AI SDK responses model", async () => {
    const server = await spinUp((_req, _body, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(responsesApiResponse("responses-ok")));
    });

    const completion = await fetchLLMCompletion({
      streaming: false,
      messages: [userMessage()],
      modelParams: baseModelParams(),
      llmConnection: {
        secretKey: encrypt("openai-api-key"),
        baseURL: `${server.url}/v1`,
        config: {
          useResponsesApi: true,
        },
      },
    });

    expect(completion).toBe("responses-ok");
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].url).toBe("/v1/responses");
  });

  it("streams OpenAI chat completion text through the AI SDK executor", async () => {
    const server = await spinUp((_req, _body, res) => {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(
        `data: ${JSON.stringify({
          id: "chatcmpl-stream-test",
          object: "chat.completion.chunk",
          created: 1,
          model: TEST_MODEL,
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: "stream-" },
              finish_reason: null,
            },
          ],
        })}\n\n`,
      );
      res.write(
        `data: ${JSON.stringify({
          id: "chatcmpl-stream-test",
          object: "chat.completion.chunk",
          created: 1,
          model: TEST_MODEL,
          choices: [
            {
              index: 0,
              delta: { content: "ok" },
              finish_reason: "stop",
            },
          ],
        })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
      res.end();
    });

    const stream = await fetchLLMCompletion({
      streaming: true,
      messages: [userMessage()],
      modelParams: baseModelParams(),
      llmConnection: {
        secretKey: encrypt("openai-api-key"),
        baseURL: `${server.url}/v1`,
      },
    });

    const decoder = new TextDecoder();
    let text = "";
    for await (const chunk of stream) {
      text += decoder.decode(chunk);
    }

    expect(text).toBe("stream-ok");
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].url).toBe("/v1/chat/completions");
  });

  it("returns structured output parsed by AI SDK Output.object", async () => {
    const structuredPayload = { score: 1, reasoning: "valid json" };
    const server = await spinUp((_req, _body, res) => {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify(
          chatCompletionResponse({
            content: JSON.stringify(structuredPayload),
          }),
        ),
      );
    });

    const completion = await fetchLLMCompletion({
      streaming: false,
      messages: [userMessage("Return JSON.")],
      modelParams: baseModelParams(),
      structuredOutputSchema: z.object({
        score: z.number(),
        reasoning: z.string(),
      }),
      llmConnection: {
        secretKey: encrypt("openai-api-key"),
        baseURL: `${server.url}/v1`,
      },
    });

    expect(completion).toEqual(structuredPayload);
    const body = JSON.parse(server.requests[0].body) as Record<string, unknown>;
    expect(body.response_format).toMatchObject({
      type: "json_schema",
    });
  });

  it("returns tool calls from the AI SDK executor", async () => {
    const server = await spinUp((_req, _body, res) => {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify(
          chatCompletionResponse({
            toolCalls: [
              {
                id: "call_test",
                name: "lookup",
                arguments: JSON.stringify({ query: "langfuse" }),
              },
            ],
          }),
        ),
      );
    });

    const completion = await fetchLLMCompletion({
      streaming: false,
      messages: [userMessage("Call the lookup tool.")],
      modelParams: baseModelParams(),
      tools: [
        {
          name: "lookup",
          description: "Look up a query.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
            },
            required: ["query"],
            additionalProperties: false,
          },
        },
      ],
      llmConnection: {
        secretKey: encrypt("openai-api-key"),
        baseURL: `${server.url}/v1`,
      },
    });

    expect(completion).toEqual({
      content: "",
      tool_calls: [
        {
          id: "call_test",
          name: "lookup",
          args: { query: "langfuse" },
        },
      ],
    });
  });

  it("declines to LangChain when OpenAI provider options are not translated", () => {
    const decision = resolveLlmExecutionDecision({
      modelParams: baseModelParams({
        providerOptions: {
          unsupported_option: true,
        },
      }),
      enabledAdapters: ["openai"],
    });

    expect(decision).toEqual({
      engine: "langchain-js",
      declineReason: "ai-sdk-untranslated-provider-options",
      declineDetail: "unsupported_option",
    });
  });
});
