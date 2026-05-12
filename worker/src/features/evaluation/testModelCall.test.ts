import { beforeEach, describe, expect, it, vi } from "vitest";
import z from "zod";
import { testModelCall } from "../../../../packages/shared/src/server/llm/testModelCall";
import { fetchLLMCompletion } from "../../../../packages/shared/src/server/llm/fetchLLMCompletion";

vi.mock(
  "../../../../packages/shared/src/server/llm/fetchLLMCompletion",
  () => ({
    fetchLLMCompletion: vi
      .fn()
      .mockResolvedValue({ score: 5, reasoning: "ok" }),
  }),
);

describe("testModelCall", () => {
  const apiKey = {
    adapter: "openai" as const,
    secretKey: "test-key",
    baseURL: null,
    extraHeaders: null,
    config: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a numeric score schema for the default evaluator model probe", async () => {
    await testModelCall({
      provider: "openai",
      model: "gpt-4.1-mini",
      apiKey,
    });

    const structuredOutputSchema = vi.mocked(fetchLLMCompletion).mock
      .calls[0]?.[0].structuredOutputSchema as z.ZodObject<{
      score: z.ZodNumber;
      reasoning: z.ZodString;
    }>;

    expect(
      structuredOutputSchema.safeParse({
        score: 5,
        reasoning: "The sample text satisfied all criteria.",
      }).success,
    ).toBe(true);
    expect(
      structuredOutputSchema.safeParse({
        score: "5",
        reasoning: "String scores should not pass the default probe.",
      }).success,
    ).toBe(false);
  });

  it("preserves caller-provided structured output schemas", async () => {
    const structuredOutputSchema = z.object({
      verdict: z.enum(["pass", "fail"]),
    });

    await testModelCall({
      provider: "openai",
      model: "gpt-4.1-mini",
      apiKey,
      structuredOutputSchema,
    });

    expect(fetchLLMCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredOutputSchema,
      }),
    );
  });
});
