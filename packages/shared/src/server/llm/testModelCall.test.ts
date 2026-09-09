import { createOpenAI } from "@ai-sdk/openai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts numeric scores from the default model probe schema", async () => {
    vi.mocked(createOpenAI).mockReturnValue({
      chat: () =>
        new MockLanguageModelV4({
          doGenerate: {
            content: [{ type: "text", text: '{"score":5,"reasoning":"ok"}' }],
            finishReason: { unified: "stop", raw: "stop" },
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
          },
        }),
      responses: vi.fn(),
    } as never);

    await expect(
      testModelCall({
        provider: "openai",
        model: "gpt-4.1-mini",
        apiKey,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects string scores from the default model probe schema", async () => {
    vi.mocked(createOpenAI).mockReturnValue({
      chat: () =>
        new MockLanguageModelV4({
          doGenerate: {
            content: [{ type: "text", text: '{"score":"5","reasoning":"ok"}' }],
            finishReason: { unified: "stop", raw: "stop" },
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
          },
        }),
      responses: vi.fn(),
    } as never);

    await expect(
      testModelCall({
        provider: "openai",
        model: "gpt-4.1-mini",
        apiKey,
      }),
    ).rejects.toBeDefined();
  });

  it("preserves caller-provided structured output schemas", async () => {
    vi.mocked(createOpenAI).mockReturnValue({
      chat: () =>
        new MockLanguageModelV4({
          doGenerate: {
            content: [{ type: "text", text: '{"verdict":"pass"}' }],
            finishReason: { unified: "stop", raw: "stop" },
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
          },
        }),
      responses: vi.fn(),
    } as never);

    await expect(
      testModelCall({
        provider: "openai",
        model: "gpt-4.1-mini",
        apiKey,
        structuredOutputSchema: z.object({
          verdict: z.enum(["pass", "fail"]),
        }),
      }),
    ).resolves.toBeUndefined();
  });

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
});
