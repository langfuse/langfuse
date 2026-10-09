import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { encrypt } from "../../encryption";
import { LLMAdapter } from "../llm/types";
import { generateTopicEmbedding } from "./embeddings";
import type { TopicsModel } from "./model-config";
import { generateTopicText } from "./text";

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
  it("sends structured output through the project's Bedrock connection", async () => {
    const output = { summary: "Account access" };
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        output: {
          message: {
            role: "assistant",
            content: [
              { toolUse: { toolUseId: "json-1", name: "json", input: output } },
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
      model: bedrockModel("summary", "us.openai.gpt-6-luna"),
      system: [{ text: "Summarize the user's request." }],
      input: "I cannot sign in.",
      schema: z.object({ summary: z.string() }),
      maxOutputTokens: 256,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const request = new Request(...fetch.mock.calls[0]);
    expect(request.url).toBe(
      "https://bedrock-runtime.eu-central-1.amazonaws.com/model/us.openai.gpt-6-luna/converse",
    );
    expect(request.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIATOPICS\//,
    );
    expect(await request.json()).toMatchObject({
      system: [{ text: "Summarize the user's request." }],
      inferenceConfig: { maxTokens: 256 },
      additionalModelRequestFields: { reasoning: { effort: "none" } },
      toolConfig: { toolChoice: { any: {} } },
    });
    expect(result.output).toEqual(output);
  });

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
      }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("reports cached prompt tokens from providers that cache automatically", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: "chatcmpl-1",
          object: "chat.completion",
          created: 1,
          model: "gpt-6-luna",
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
        model: "gpt-6-luna",
        connection: { secretKey: encrypt("sk-test") },
      },
      system: [{ text: "System prompt and facets.", cache: true }],
      input: "I cannot sign in.",
      schema: z.object({ summary: z.string() }),
      maxOutputTokens: 256,
    });

    expect(result.usage).toMatchObject({
      inputTokens: 3000,
      cacheReadTokens: 2560,
    });
  });
});

describe("generateTopicEmbedding", () => {
  it("requests clustering vectors of the configured size from Cohere on Bedrock", async () => {
    const vector = Array.from({ length: 512 }, (_, index) => index + 1);
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        { embeddings: { float: [vector] }, texts: ["Account access"] },
        { headers: { "x-amzn-bedrock-input-token-count": "3" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await generateTopicEmbedding({
      model: bedrockModel("embedding", "eu.cohere.embed-v4:0"),
      summary: "Account access",
      dimensions: 512,
    });

    const request = new Request(...fetch.mock.calls[0]);
    expect(decodeURIComponent(request.url)).toBe(
      "https://bedrock-runtime.eu-central-1.amazonaws.com/model/eu.cohere.embed-v4:0/invoke",
    );
    expect(await request.json()).toEqual({
      input_type: "clustering",
      texts: ["Account access"],
      truncate: "NONE",
      output_dimension: 512,
    });
    expect(result.embedding).toEqual(vector);
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

    const result = await generateTopicEmbedding({
      model: {
        slot: "embedding",
        provider: "openai-topics",
        adapter: LLMAdapter.OpenAI,
        model: "text-embedding-3-small",
        connection: { secretKey: encrypt("sk-test") },
      },
      summary: "Account access",
      dimensions: 768,
    });

    const request = new Request(...fetch.mock.calls[0]);
    expect(request.url).toBe("https://api.openai.com/v1/embeddings");
    expect(await request.json()).toMatchObject({
      model: "text-embedding-3-small",
      input: ["Account access"],
      dimensions: 768,
    });
    expect(result.embedding).toHaveLength(768);
  });
});
