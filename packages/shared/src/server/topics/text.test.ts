import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateTopicText } from "./text";

vi.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain: vi.fn(() => async () => ({
    accessKeyId: "topics-test-key",
    secretAccessKey: "topics-test-secret",
    sessionToken: "topics-test-session",
  })),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("generateTopicText", () => {
  it.each([
    "us.openai.gpt-5.6-luna",
    "us.openai.gpt-5.6-terra",
    "us.openai.gpt-6-luna",
    "global.openai.gpt-6-luna",
  ])(
    "serializes uncached %s structured output through Converse with the Topics profile",
    async (model) => {
      const schema = z.object({ summary: z.string() });
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
      vi.stubEnv("AWS_BEARER_TOKEN_BEDROCK", "ambient-bearer-token");

      const result = await generateTopicText({
        model,
        system: [{ text: "Summarize the user's request." }],
        input: "I cannot sign in.",
        schema,
        maxOutputTokens: 256,
        region: "eu-central-1",
        profile: "topics-local",
      });

      expect(fromNodeProviderChain).toHaveBeenCalledWith({
        profile: "topics-local",
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      const request = new Request(...fetch.mock.calls[0]);
      expect(request.url).toBe(
        `https://bedrock-runtime.eu-central-1.amazonaws.com/model/${model}/converse`,
      );
      expect(request.headers.get("authorization")).toMatch(
        /^AWS4-HMAC-SHA256 Credential=topics-test-key\//,
      );
      expect(request.headers.get("x-amz-security-token")).toBe(
        "topics-test-session",
      );
      const body = await request.json();
      expect(body).toMatchObject({
        system: [{ text: "Summarize the user's request." }],
        messages: [{ role: "user", content: [{ text: "I cannot sign in." }] }],
        inferenceConfig: { maxTokens: 256 },
        additionalModelRequestFields: { reasoning: { effort: "none" } },
        toolConfig: {
          tools: [
            {
              toolSpec: {
                name: "json",
                inputSchema: {
                  json: {
                    type: "object",
                    properties: { summary: { type: "string" } },
                    required: ["summary"],
                    additionalProperties: false,
                  },
                },
              },
            },
          ],
          toolChoice: { any: {} },
        },
      });
      expect(body).not.toHaveProperty("inferenceConfig.temperature");
      expect(result.output).toEqual(output);
      expect(result.usage).toMatchObject({
        inputTokens: 12,
        outputTokens: 4,
        totalTokens: 16,
      });
    },
  );

  it("sends cached prompts to the regional Bedrock Mantle endpoint with explicit cache breakpoints", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        id: "chatcmpl-1",
        object: "chat.completion",
        created: 0,
        model: "openai.gpt-6-luna",
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
          prompt_tokens: 3653,
          completion_tokens: 275,
          total_tokens: 3928,
          prompt_tokens_details: { cached_tokens: 2840, cache_write_tokens: 0 },
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("AWS_BEARER_TOKEN_BEDROCK", "ambient-bearer-token");

    const result = await generateTopicText({
      model: "us.openai.gpt-6-luna",
      system: [
        { text: "System prompt and built-in facets.", cache: true },
        { text: "Custom facets.", cache: true },
      ],
      input: "I cannot sign in.",
      schema: z.object({ summary: z.string() }),
      maxOutputTokens: 256,
      region: "us-east-1",
      profile: "topics-local",
    });

    const request = new Request(...fetch.mock.calls[0]);
    // The configured region's endpoint and the in-region model ID; no cross-geography routing.
    expect(request.url).toBe(
      "https://bedrock-mantle.us-east-1.api.aws/openai/v1/chat/completions",
    );
    expect(request.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=topics-test-key\/\d{8}\/us-east-1\/bedrock-mantle\//,
    );
    const body = (await request.json()) as Record<string, unknown>;
    expect(body.model).toBe("openai.gpt-6-luna");
    expect(body.messages).toEqual([
      {
        role: "system",
        content: [
          {
            type: "text",
            text: "System prompt and built-in facets.",
            prompt_cache_breakpoint: { mode: "explicit" },
          },
        ],
      },
      {
        role: "system",
        content: [
          {
            type: "text",
            text: "Custom facets.",
            prompt_cache_breakpoint: { mode: "explicit" },
          },
        ],
      },
      // The transcript stays after the last breakpoint, outside the cached prefix.
      { role: "user", content: "I cannot sign in." },
    ]);
    expect(body).toMatchObject({
      prompt_cache_options: { mode: "explicit", ttl: "30m" },
      reasoning_effort: "none",
      max_completion_tokens: 256,
      response_format: { type: "json_schema" },
    });
    expect(result.output).toEqual({ summary: "Account access" });
    expect(result.usage).toMatchObject({
      inputTokens: 3653,
      outputTokens: 275,
      cacheReadTokens: 2840,
    });
  });

  it("keeps a model from another geography on Converse instead of routing across regions", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        output: {
          message: {
            role: "assistant",
            content: [
              {
                toolUse: {
                  toolUseId: "json-1",
                  name: "json",
                  input: { summary: "x" },
                },
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

    await generateTopicText({
      model: "us.openai.gpt-6-luna",
      system: [{ text: "Summarize.", cache: true }],
      input: "Hi",
      schema: z.object({ summary: z.string() }),
      maxOutputTokens: 256,
      region: "eu-west-1",
    });

    expect(new Request(...fetch.mock.calls[0]).url).toBe(
      "https://bedrock-runtime.eu-west-1.amazonaws.com/model/us.openai.gpt-6-luna/converse",
    );
  });

  it("rejects a host-reshaping region before resolving credentials or sending a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      generateTopicText({
        model: "us.openai.gpt-5.6-luna",
        system: [{ text: "Summarize.", cache: true }],
        input: "Hi",
        schema: z.object({ summary: z.string() }),
        maxOutputTokens: 256,
        region: "eu-central-1.attacker.test",
      }),
    ).rejects.toThrow("Invalid Bedrock region");
    expect(fromNodeProviderChain).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
