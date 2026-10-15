import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { encrypt } from "../../encryption";
import { env } from "../../env";
import { BEDROCK_USE_DEFAULT_CREDENTIALS } from "../../interfaces/customLLMProviderConfigSchemas";
import { LLMAdapter, type TraceSinkParams } from "../llm/types";
import type { ResourceSpan } from "../otel/OtelIngestionProcessor";
import { generateTopicEmbeddings } from "./embeddings";
import type { TopicsModel } from "./model-config";
import { generateTopicText } from "./text";

const { publishToOtelIngestionQueue, processorConstructor } = vi.hoisted(
  () => ({
    publishToOtelIngestionQueue:
      vi.fn<(spans: ResourceSpan[]) => Promise<void>>(),
    processorConstructor: vi.fn(),
  }),
);

vi.mock("../otel/OtelIngestionProcessor", () => ({
  OtelIngestionProcessor: class {
    constructor(config: unknown) {
      processorConstructor(config);
    }
    publishToOtelIngestionQueue = publishToOtelIngestionQueue;
  },
}));

// Request-shape tests use the real SDK and replace the separately tested secure transport.
vi.mock("../llm/secureLlmFetch", () => ({
  createSecureLlmFetch: () => globalThis.fetch,
}));

const trace: TraceSinkParams = {
  targetProjectId: "ai-features-project",
  traceId: "0af7651916cd43dd8448eb211c80319c",
  traceName: "topics-summary",
  environment: "langfuse-topics",
  metadata: { project_id: "source-project" },
};

function tracedGeneration() {
  expect(processorConstructor).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: trace.targetProjectId,
      isLangfuseInternal: true,
      ingestionVersion: "4",
    }),
  );
  expect(publishToOtelIngestionQueue).toHaveBeenCalledTimes(1);
  const spans = publishToOtelIngestionQueue.mock.calls[0][0].flatMap(
    (resource) =>
      resource.scopeSpans?.flatMap((scope) => scope.spans ?? []) ?? [],
  );
  expect(spans).toHaveLength(1);
  const span = spans[0];
  expect(span.traceId).toBe(trace.traceId);
  expect(span.parentSpanId ?? "").toBe("");
  expect(span.name).toBe(trace.traceName);
  const attributes = Object.fromEntries(
    (span.attributes ?? []).map(({ key, value }) => [
      key,
      value.stringValue ?? value,
    ]),
  );
  expect(attributes).toMatchObject({
    "langfuse.observation.type": "generation",
    "langfuse.environment": "langfuse-topics",
    "langfuse.trace.metadata": JSON.stringify(trace.metadata),
  });
  return attributes;
}

beforeEach(() => {
  vi.clearAllMocks();
  publishToOtelIngestionQueue.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function bedrockModel(slot: TopicsModel["slot"], model: string): TopicsModel {
  return {
    slot,
    provider: "bedrock-topics",
    adapter: LLMAdapter.Bedrock,
    model,
    connection: {
      secretKey: encrypt(
        JSON.stringify({ accessKeyId: "AKIATOPICS", secretAccessKey: "s" }),
      ),
      config: { region: "eu-central-1" },
    },
  };
}

describe("generateTopicText", () => {
  it("clusters with Bedrock Sonnet 5.5 without forcing tool use", async () => {
    const output = { name: "Account access" };
    const fetch = vi.fn<typeof globalThis.fetch>(async (...args) => {
      const body = (await new Request(...args).json()) as {
        toolConfig?: { toolChoice?: Record<string, unknown> };
      };
      if (
        body.toolConfig?.toolChoice?.any ||
        body.toolConfig?.toolChoice?.tool
      ) {
        return Response.json(
          {
            message:
              'tool_choice: type "tool" and "any" are not supported for this model.',
          },
          { status: 400 },
        );
      }
      return Response.json({
        output: {
          message: {
            role: "assistant",
            content: [{ text: JSON.stringify(output) }],
          },
        },
        stopReason: "end_turn",
        usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
        metrics: { latencyMs: 1 },
      });
    });
    vi.stubGlobal("fetch", fetch);

    const result = await generateTopicText({
      model: bedrockModel("clustering", "us.anthropic.claude-sonnet-5-5"),
      system: [{ text: "Name the topic." }],
      input: "Users cannot sign in.",
      schema: z.object({ name: z.string() }),
      maxOutputTokens: 256,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const body = await new Request(...fetch.mock.calls[0]).json();
    expect(body).not.toHaveProperty("toolConfig");
    expect(body).not.toHaveProperty(
      "additionalModelRequestFields.thinking.type",
      "disabled",
    );
    expect(body).toHaveProperty(
      "system",
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining('"name"') }),
      ]),
    );
    expect(result.output).toEqual(output);
    expect(result.usage).toMatchObject({ inputTokens: 12, outputTokens: 4 });
  });

  it.each(["us.openai.gpt-6-luna", "openai.gpt-oss-120b"])(
    "sends structured output through the project's Bedrock connection: %s",
    async (modelId) => {
      const output = { summary: "Account access" };
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({
          output: {
            message: {
              role: "assistant",
              content: [
                {
                  toolUse: { toolUseId: "json-1", name: "json", input: output },
                },
              ],
            },
          },
          stopReason: "tool_use",
          usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
          metrics: { latencyMs: 1 },
        }),
      );
      vi.stubGlobal("fetch", fetch);
      // Connection credentials must win over ambient worker credentials.
      vi.stubEnv("AWS_BEARER_TOKEN_BEDROCK", "ambient-bearer-token");

      const result = await generateTopicText({
        model: bedrockModel("summary", modelId),
        system: [
          {
            text: "Summarize the user's request.",
            cache: modelId.includes("oss"),
          },
        ],
        input: "I cannot sign in.",
        schema: z.object({ summary: z.string() }),
        maxOutputTokens: 256,
        trace,
      });

      expect(fetch).toHaveBeenCalledTimes(1);
      const request = new Request(...fetch.mock.calls[0]);
      expect(request.url).toBe(
        `https://bedrock-runtime.eu-central-1.amazonaws.com/model/${modelId}/converse`,
      );
      expect(request.headers.get("authorization")).toMatch(
        /^AWS4-HMAC-SHA256 Credential=AKIATOPICS\//,
      );
      const body = await request.json();
      expect(body).toMatchObject({
        system: [{ text: "Summarize the user's request." }],
        inferenceConfig: { maxTokens: 256 },
        toolConfig: { toolChoice: { any: {} } },
      });
      expect(result.output).toEqual(output);
      if (modelId.includes("oss")) {
        expect(body).not.toHaveProperty("additionalModelRequestFields");
      } else {
        expect(body).toHaveProperty(
          "additionalModelRequestFields.reasoning.effort",
          "none",
        );
      }
      expect(tracedGeneration()).toMatchObject({
        "langfuse.observation.input": JSON.stringify([
          { role: "system", content: "Summarize the user's request." },
          { role: "user", content: "I cannot sign in." },
        ]),
        "langfuse.observation.output": JSON.stringify(output),
        "langfuse.observation.model.name": modelId,
        "langfuse.observation.usage_details": JSON.stringify({
          input: 12,
          output: 4,
          total: 16,
          input_cached_tokens: 0,
          input_cache_creation: 0,
        }),
      });
    },
  );

  it("sends cached prompts through InvokeModel with the connection's credentials and region", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify({ summary: "Account access" }) },
          },
        ],
        usage: {
          prompt_tokens: 3653,
          completion_tokens: 275,
          total_tokens: 3928,
          prompt_tokens_details: { cached_tokens: 2840, cache_write_tokens: 0 },
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await generateTopicText({
      model: bedrockModel("summary", "us.openai.gpt-6-luna"),
      system: [
        { text: "System prompt and built-in facets.", cache: true },
        { text: "Custom facets.", cache: true },
      ],
      input: "I cannot sign in.",
      schema: z.object({ summary: z.string() }),
      maxOutputTokens: 256,
      trace,
    });

    const request = new Request(...fetch.mock.calls[0]);
    expect(request.url).toBe(
      "https://bedrock-runtime.eu-central-1.amazonaws.com/model/us.openai.gpt-6-luna/invoke",
    );
    expect(request.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIATOPICS\/\d{8}\/eu-central-1\/bedrock\//,
    );
    const body = (await request.json()) as {
      messages: { content: unknown }[];
      prompt_cache_options: unknown;
    };
    // One breakpoint per cached part; the transcript stays after the last one.
    expect(body.messages).toEqual([
      {
        role: "system",
        content: [
          expect.objectContaining({
            prompt_cache_breakpoint: { mode: "explicit" },
          }),
          expect.objectContaining({
            prompt_cache_breakpoint: { mode: "explicit" },
          }),
        ],
      },
      { role: "user", content: [{ type: "text", text: "I cannot sign in." }] },
    ]);
    expect(body.prompt_cache_options).toEqual({ mode: "explicit", ttl: "30m" });
    expect(tracedGeneration()).toMatchObject({
      "langfuse.observation.output": JSON.stringify({
        summary: "Account access",
      }),
      "langfuse.observation.usage_details": JSON.stringify({
        input: 813,
        output: 275,
        total: 3928,
        input_cached_tokens: 2840,
        input_cache_creation: 0,
      }),
    });
    expect(result.usage).toEqual({
      inputTokens: 3653,
      outputTokens: 275,
      totalTokens: 3928,
      cacheReadTokens: 2840,
      cacheWriteTokens: 0,
    });
  });

  it("reports the InvokeModel HTTP status so throttling is classified", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Too many requests", { status: 429 })),
    );
    await expect(
      generateTopicText({
        model: bedrockModel("summary", "us.openai.gpt-6-luna"),
        system: [{ text: "Summarize.", cache: true }],
        input: "Hi",
        schema: z.object({ summary: z.string() }),
        maxOutputTokens: 256,
        trace,
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(tracedGeneration()).toMatchObject({
      "langfuse.observation.level": "ERROR",
      "langfuse.observation.status_message": expect.stringContaining("429"),
    });
  });

  it.each([
    [undefined, "gpt-6-luna", "none", true],
    ["https://eu.api.openai.com/v1", "gpt-5-mini", "minimal", true],
    ["https://EU.API.OPENAI.COM./v1", "gpt-5.6-terra", "none", true],
    ["https://eu.api.openai.com/v1", "gpt-4o", undefined, false],
    [
      "https://eu.api.openai.com.example.com/v1",
      "gpt-6-luna",
      undefined,
      false,
    ],
  ] as const)(
    "generates and traces Topics on %s / %s",
    async (baseURL, model, reasoning, completionTokens) => {
      publishToOtelIngestionQueue.mockRejectedValueOnce(
        new Error("queue down"),
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            id: "chatcmpl-1",
            object: "chat.completion",
            created: 1,
            model,
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: JSON.stringify({ summary: "Account access" }),
                },
              },
            ],
            usage: {
              prompt_tokens: 3000,
              completion_tokens: 200,
              total_tokens: 3200,
              prompt_tokens_details: { cached_tokens: 2560 },
            },
          }),
        ),
      );

      const result = await generateTopicText({
        model: {
          slot: "summary",
          provider: "openai-topics",
          adapter: LLMAdapter.OpenAI,
          model,
          connection: {
            secretKey: encrypt("sk-test"),
            baseURL,
            config: { useResponsesApi: false },
          },
        },
        system: [{ text: "System prompt and facets.", cache: true }],
        input: "I cannot sign in.",
        schema: z.object({ summary: z.string() }),
        maxOutputTokens: 256,
        trace,
      });

      const request = new Request(...vi.mocked(globalThis.fetch).mock.calls[0]);
      expect(request.url).toBe(
        `${new URL(baseURL ?? "https://api.openai.com/v1")}/chat/completions`,
      );
      const body = (await request.json()) as Record<string, unknown>;
      expect(body.max_completion_tokens).toBe(
        completionTokens ? 256 : undefined,
      );
      expect(body.max_tokens).toBe(completionTokens ? undefined : 256);
      expect(body.reasoning_effort).toBe(reasoning);
      expect(body.response_format).toMatchObject({ type: "json_schema" });
      expect(tracedGeneration()).toMatchObject({
        "langfuse.observation.output": JSON.stringify({
          summary: "Account access",
        }),
        "langfuse.observation.model.name": model,
        "langfuse.observation.usage_details": JSON.stringify({
          input: 440,
          output: 200,
          total: 3200,
          input_cached_tokens: 2560,
        }),
      });
      expect(result.usage).toMatchObject({
        inputTokens: 3000,
        cacheReadTokens: 2560,
      });
    },
  );
  it("retains SDK usage when no output is generated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: "chatcmpl-empty",
          object: "chat.completion",
          created: 1,
          model: "gpt-6-luna",
          choices: [
            {
              index: 0,
              finish_reason: "length",
              message: { role: "assistant", content: null },
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
        }),
      ),
    );

    await expect(
      generateTopicText({
        model: {
          slot: "summary",
          provider: "openai-topics",
          adapter: LLMAdapter.OpenAI,
          model: "gpt-6-luna",
          connection: { secretKey: encrypt("sk-test") },
        },
        system: [{ text: "Summarize." }],
        input: "Hi",
        schema: z.object({ summary: z.string() }),
        maxOutputTokens: 256,
        trace,
      }),
    ).rejects.toMatchObject({ name: "AI_NoOutputGeneratedError" });
    expect(tracedGeneration()).toMatchObject({
      "langfuse.observation.level": "ERROR",
      "langfuse.observation.usage_details": JSON.stringify({
        input: 12,
        output: 4,
        total: 16,
        input_cached_tokens: 0,
      }),
    });
  });

  it.each([false, true])(
    "traces invalid structured output with its paid usage (cached: %s)",
    async (cache) => {
      const output = { summary: 42 };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json(
            cache
              ? {
                  choices: [
                    {
                      finish_reason: "stop",
                      message: { content: JSON.stringify(output) },
                    },
                  ],
                  usage: {
                    prompt_tokens: 12,
                    completion_tokens: 4,
                    total_tokens: 16,
                  },
                }
              : {
                  output: {
                    message: {
                      role: "assistant",
                      content: [
                        {
                          toolUse: {
                            toolUseId: "json-1",
                            name: "json",
                            input: output,
                          },
                        },
                      ],
                    },
                  },
                  stopReason: "tool_use",
                  usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
                  metrics: { latencyMs: 1 },
                },
          ),
        ),
      );
      const response = generateTopicText({
        model: bedrockModel("summary", "us.openai.gpt-6-luna"),
        system: [{ text: "Summarize.", cache }],
        input: "Hi",
        schema: z.object({ summary: z.string() }),
        maxOutputTokens: 256,
        trace,
      });
      if (cache) {
        await expect(response).resolves.toMatchObject({
          output,
          usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
        });
      } else {
        await expect(response).rejects.toThrow();
      }
      const attributes = tracedGeneration();
      expect(attributes).toMatchObject({
        "langfuse.observation.level": "ERROR",
        "langfuse.observation.usage_details": JSON.stringify({
          input: 12,
          output: 4,
          total: 16,
          ...(cache ? {} : { input_cached_tokens: 0, input_cache_creation: 0 }),
        }),
      });
      expect(
        JSON.parse(attributes["langfuse.observation.output"] as string),
      ).toEqual(cache ? output : JSON.stringify(output));
    },
  );
});

describe("generateTopicEmbeddings", () => {
  it("embeds every summary in one Cohere request on Bedrock", async () => {
    const vector = Array.from({ length: 512 }, (_, index) => index + 1);
    const other = vector.map((value) => -value);
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          embeddings: { float: [vector, other] },
          texts: ["Account access", "Refund request"],
        },
        { headers: { "x-amzn-bedrock-input-token-count": "3" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await generateTopicEmbeddings({
      model: bedrockModel("embedding", "eu.cohere.embed-v4:0"),
      summaries: ["Account access", "Refund request"],
      dimensions: 512,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const request = new Request(...fetch.mock.calls[0]);
    expect(decodeURIComponent(request.url)).toBe(
      "https://bedrock-runtime.eu-central-1.amazonaws.com/model/eu.cohere.embed-v4:0/invoke",
    );
    expect(await request.json()).toEqual({
      input_type: "clustering",
      texts: ["Account access", "Refund request"],
      truncate: "NONE",
      output_dimension: 512,
    });
    expect(result.embeddings).toEqual([vector, other]);
    expect(publishToOtelIngestionQueue).not.toHaveBeenCalled();
  });

  it("asks OpenAI for any configured size", async () => {
    const vector = Array.from({ length: 768 }, () => 0.5);
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        data: [{ embedding: vector, index: 0 }],
        usage: { prompt_tokens: 3 },
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await generateTopicEmbeddings({
      model: {
        slot: "embedding",
        provider: "openai-topics",
        adapter: LLMAdapter.OpenAI,
        model: "text-embedding-3-small",
        connection: { secretKey: encrypt("sk-test") },
      },
      summaries: ["Account access"],
      dimensions: 768,
    });

    const request = new Request(...fetch.mock.calls[0]);
    expect(request.url).toBe("https://api.openai.com/v1/embeddings");
    expect(await request.json()).toMatchObject({
      model: "text-embedding-3-small",
      input: ["Account access"],
      dimensions: 768,
    });
    expect(result.embeddings[0]).toHaveLength(768);
  });

  it("retries without the size option when a fixed-size model rejects it", async () => {
    const vector = Array.from({ length: 1536 }, () => 0.5);
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) =>
      JSON.parse(String(init?.body)).dimensions
        ? Response.json(
            {
              error: {
                message: "This model does not support specifying dimensions.",
              },
            },
            { status: 400 },
          )
        : Response.json({
            data: [{ embedding: vector, index: 0 }],
            usage: { prompt_tokens: 3 },
          }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await generateTopicEmbeddings({
      model: {
        slot: "embedding",
        provider: "openai-topics",
        adapter: LLMAdapter.OpenAI,
        model: "text-embedding-ada-002",
        connection: { secretKey: encrypt("sk-test") },
      },
      summaries: ["Account access"],
      dimensions: 1536,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await new Request(...fetch.mock.calls[1]).json()).not.toHaveProperty(
      "dimensions",
    );
    expect(result.embeddings[0]).toHaveLength(1536);
  });

  it("falls back when a rate-limit retry precedes the size rejection", async () => {
    const vector = Array.from({ length: 1536 }, () => 0.5);
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      if (fetch.mock.calls.length === 1)
        return Response.json(
          { error: { message: "Rate limit exceeded" } },
          { status: 429 },
        );
      if (JSON.parse(String(init?.body)).dimensions)
        return Response.json(
          {
            error: {
              message: "This model does not support specifying dimensions.",
            },
          },
          { status: 400 },
        );
      return Response.json({
        data: [{ embedding: vector, index: 0 }],
        usage: { prompt_tokens: 3 },
      });
    });
    vi.stubGlobal("fetch", fetch);

    const result = await generateTopicEmbeddings({
      model: {
        slot: "embedding",
        provider: "openai-topics",
        adapter: LLMAdapter.OpenAI,
        model: "text-embedding-ada-002",
        connection: { secretKey: encrypt("sk-test") },
      },
      summaries: ["Account access"],
      dimensions: 1536,
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(await new Request(...fetch.mock.calls[2]).json()).not.toHaveProperty(
      "dimensions",
    );
    expect(result.embeddings[0]).toHaveLength(1536);
  });
});

describe("allowlisted Cloud Bedrock runtime credentials", () => {
  const originalEnv = {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    LANGFUSE_BEDROCK_LLM_CONNECTION_RUNTIME_CREDENTIALS_ALLOWED_PROJECT_IDS:
      env.LANGFUSE_BEDROCK_LLM_CONNECTION_RUNTIME_CREDENTIALS_ALLOWED_PROJECT_IDS,
  };

  beforeEach(() => {
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "eu";
    env.LANGFUSE_BEDROCK_LLM_CONNECTION_RUNTIME_CREDENTIALS_ALLOWED_PROJECT_IDS =
      ["allowed"];
    vi.stubEnv("AWS_PROFILE", undefined);
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIARUNTIME");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "runtime-secret");
  });

  afterEach(() => Object.assign(env, originalEnv));

  const runtimeModel = (slot: TopicsModel["slot"], projectId: string) => {
    const model = bedrockModel(
      slot,
      slot === "embedding" ? "eu.cohere.embed-v4:0" : "us.openai.gpt-6-luna",
    );
    model.connection = {
      ...model.connection,
      projectId,
      secretKey: encrypt(BEDROCK_USE_DEFAULT_CREDENTIALS),
    };
    return model;
  };

  it("uses the existing project allowlist for cached text", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify({ summary: "Account access" }) },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const input = {
      system: [{ text: "Summarize.", cache: true }],
      input: "I cannot sign in.",
      schema: z.object({ summary: z.string() }),
      maxOutputTokens: 256,
    };

    await generateTopicText({
      ...input,
      model: runtimeModel("summary", "allowed"),
    });
    expect(
      new Request(...fetch.mock.calls[0]).headers.get("authorization"),
    ).toContain("Credential=AKIARUNTIME/");
    await expect(
      generateTopicText({ ...input, model: runtimeModel("summary", "other") }),
    ).rejects.toThrow("Invalid Bedrock credentials");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(publishToOtelIngestionQueue).not.toHaveBeenCalled();
  });

  it("uses the existing project allowlist for embeddings", async () => {
    const vector = Array.from({ length: 512 }, () => 0.1);
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        { embeddings: { float: [vector] }, texts: ["Account access"] },
        { headers: { "x-amzn-bedrock-input-token-count": "3" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const input = { summaries: ["Account access"], dimensions: 512 };

    await generateTopicEmbeddings({
      ...input,
      model: runtimeModel("embedding", "allowed"),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(
      generateTopicEmbeddings({
        ...input,
        model: runtimeModel("embedding", "other"),
      }),
    ).rejects.toThrow("Invalid Bedrock credentials");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
