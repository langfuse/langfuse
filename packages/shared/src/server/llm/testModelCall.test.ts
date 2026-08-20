import { createOpenAI } from "@ai-sdk/openai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";

import { encrypt } from "../../encryption";
import { testModelCall } from "./testModelCall";
import { LLMAdapter } from "./types";

vi.mock("@ai-sdk/openai", () => ({ createOpenAI: vi.fn() }));

describe("testModelCall", () => {
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
        apiKey: {
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
        },
      }),
    ).rejects.toMatchObject({ name: "AI_NoOutputGeneratedError" });
  });
});
