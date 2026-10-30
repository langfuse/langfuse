import { createOpenAI } from "@ai-sdk/openai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { encrypt } from "../../encryption";
import { testModelCall } from "./testModelCall";
import { LLMAdapter } from "./types";

vi.mock("@ai-sdk/openai", () => ({ createOpenAI: vi.fn() }));

describe("testModelCall", () => {
  const apiKey = {
    id: "api-key-id",
    projectId: "project-id",
    createdAt: new Date(),
    updatedAt: new Date(),
    adapter: LLMAdapter.OpenAI,
    provider: "openai",
    displaySecretKey: "sk-...test",
    secretKey: encrypt("sk-test"),
    extraHeaders: null,
    extraHeaderKeys: [],
    baseURL: null,
    customModels: [],
    withDefaultModels: true,
    config: null,
  };

  it("rejects when the model produces no structured output", async () => {
    vi.mocked(createOpenAI).mockReturnValue({
      chat: () =>
        new MockLanguageModelV4({
          doGenerate: {
            content: [],
            finishReason: { unified: "length", raw: "length" },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 1, text: 0, reasoning: 1 },
            },
            warnings: [],
          },
        }),
      responses: vi.fn(),
    } as never);

    await expect(
      testModelCall({
        provider: "openai",
        model: "reasoning-model",
        apiKey,
      }),
    ).rejects.toMatchObject({ name: "AI_NoOutputGeneratedError" });
  });

  it("shows the output schema to the model", async () => {
    const requests: Array<{ prompt: unknown }> = [];
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        requests.push({ prompt: options.prompt });
        return {
          content: [
            {
              type: "text" as const,
              text: '{"reasoning":"The criteria are satisfied.","score":true}',
            },
          ],
          finishReason: { unified: "stop" as const, raw: "stop" },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
          warnings: [],
        };
      },
    });
    vi.mocked(createOpenAI).mockReturnValue({
      chat: () => model,
      responses: vi.fn(),
    } as never);

    const params = {
      provider: "openai",
      model: "reasoning-model",
      apiKey,
      structuredOutputSchema: z.object({
        reasoning: z.string().describe("Return one concise sentence."),
        score: z
          .boolean()
          .describe("Return true when the criteria are satisfied."),
      }),
    };

    await testModelCall(params);

    const prompt = JSON.stringify(requests[0]?.prompt);
    expect(prompt).toContain("Return one concise sentence.");
    expect(prompt).toContain("Return true when the criteria are satisfied.");
  });
});
