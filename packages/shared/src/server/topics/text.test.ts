import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateTopicText } from "./text";

const bedrock = vi.hoisted(() => ({ config: vi.fn(), send: vi.fn() }));
vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: class {
    constructor(config: unknown) {
      bedrock.config(config);
    }
    send = bedrock.send;
  },
  InvokeModelCommand: class {
    constructor(public input: unknown) {}
  },
}));

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

  it("sends cached prompts through InvokeModel with explicit cache breakpoints", async () => {
    bedrock.send.mockResolvedValue({
      body: new TextEncoder().encode(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({ summary: "Account access" }),
              },
            },
          ],
          usage: {
            prompt_tokens: 3653,
            completion_tokens: 275,
            total_tokens: 3928,
            prompt_tokens_details: {
              cached_tokens: 2840,
              cache_write_tokens: 0,
            },
          },
        }),
      ),
    });
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

    expect(bedrock.config).toHaveBeenCalledWith(
      expect.objectContaining({
        region: "us-east-1",
        authSchemePreference: ["sigv4"],
        maxAttempts: 1,
      }),
    );
    expect(fromNodeProviderChain).toHaveBeenCalledWith({
      profile: "topics-local",
    });
    const command = bedrock.send.mock.calls[0][0].input;
    expect(command.modelId).toBe("us.openai.gpt-6-luna");
    const body = JSON.parse(command.body);
    expect(body.messages).toEqual([
      {
        role: "system",
        content: [
          {
            type: "text",
            text: "System prompt and built-in facets.",
            prompt_cache_breakpoint: { mode: "explicit" },
          },
          {
            type: "text",
            text: "Custom facets.",
            prompt_cache_breakpoint: { mode: "explicit" },
          },
        ],
      },
      // The transcript stays after the last breakpoint, outside the cached prefix.
      { role: "user", content: [{ type: "text", text: "I cannot sign in." }] },
    ]);
    expect(body).toMatchObject({
      prompt_cache_options: { mode: "explicit", ttl: "30m" },
      reasoning_effort: "none",
      max_completion_tokens: 256,
      response_format: {
        type: "json_schema",
        json_schema: {
          strict: true,
          schema: {
            type: "object",
            properties: { summary: { type: "string" } },
            required: ["summary"],
            additionalProperties: false,
          },
        },
      },
    });
    expect(result).toEqual({
      output: { summary: "Account access" },
      usage: {
        inputTokens: 3653,
        outputTokens: 275,
        totalTokens: 3928,
        cacheReadTokens: 2840,
        cacheWriteTokens: 0,
      },
    });
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
