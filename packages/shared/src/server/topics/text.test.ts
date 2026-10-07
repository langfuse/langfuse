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
      messages: [
        { role: "system", content: "Summarize the user's request." },
        { role: "user", content: "I cannot sign in." },
      ],
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
});
