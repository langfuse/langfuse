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
  it.each(["global.openai.gpt-5.6-luna", "global.openai.gpt-5.6-terra"])(
    "serializes %s structured output through Bedrock with the Topics profile",
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
        messages: [
          { role: "system", content: "Summarize the user's request." },
          { role: "user", content: "I cannot sign in." },
        ],
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
        additionalModelRequestFields: { reasoning_effort: "none" },
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

  it("rejects a host-reshaping region before resolving credentials or sending a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      generateTopicText({
        model: "global.openai.gpt-5.6-luna",
        messages: [{ role: "user", content: "Hi" }],
        schema: z.object({ summary: z.string() }),
        maxOutputTokens: 256,
        region: "eu-central-1.attacker.test",
      }),
    ).rejects.toThrow("Invalid Bedrock region");
    expect(fromNodeProviderChain).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
