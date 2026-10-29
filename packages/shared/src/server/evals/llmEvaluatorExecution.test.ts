import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  compilePersistedEvalOutputDefinition,
  createNumericEvalOutputDefinition,
} from "../../features/evals/outputDefinition";
import { ChatMessageRole, ChatMessageType, LLMAdapter } from "../llm/types";
import {
  executeLlmEvaluator,
  generateLlmEvaluatorOutput,
} from "./llmEvaluatorExecution";

const { mockGenerateLLMText } = vi.hoisted(() => ({
  mockGenerateLLMText: vi.fn(),
}));

vi.mock("../llm/llmText", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../llm/llmText")>()),
  createLLMOutput: (schema: z.ZodType) => ({ schema }),
  generateLLMText: mockGenerateLLMText,
}));

vi.mock("../llm/mediaMessages", () => ({
  compileLangfuseMediaMessages: async ({
    messages,
  }: {
    messages: Array<{ role: string; content: string }>;
  }) => {
    const mapped = messages.map(({ role, content }) => ({ role, content }));
    return { providerMessages: mapped, traceMessages: mapped };
  },
}));

describe("generateLlmEvaluatorOutput", () => {
  beforeEach(() => {
    mockGenerateLLMText.mockReset();
  });

  it("renames reasoning only for the model call and maps it back", async () => {
    mockGenerateLLMText.mockResolvedValue({
      output: { score: 0.8, scoreExplanation: "Good response" },
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const { outputResultSchema } = compilePersistedEvalOutputDefinition(
      createNumericEvalOutputDefinition({
        scoreDescription: "score between 0 and 1",
        reasoningDescription: "why this score was given",
      }),
    );

    const result = await generateLlmEvaluatorOutput({
      projectId: "project-123",
      connection: { secretKey: "secret" },
      modelParams: {
        provider: "openai",
        model: "gpt-4.1",
        adapter: LLMAdapter.OpenAI,
      },
      messages: [
        {
          role: ChatMessageRole.User,
          type: ChatMessageType.User,
          content: "Judge this answer",
        },
      ],
      outputResultSchema,
      trace: {
        targetProjectId: "project-123",
        traceId: "trace-123",
        traceName: "Judge trace",
        environment: "langfuse-llm-as-a-judge",
      },
    });

    const call = mockGenerateLLMText.mock.calls[0][0];
    expect(call).toMatchObject({
      maxRetries: 1,
      trace: { traceId: "trace-123" },
    });
    const modelSchema = z.toJSONSchema(call.output.schema as z.ZodType);
    expect(modelSchema).toMatchObject({
      description:
        'Return only top-level "score" and "scoreExplanation". Put other requested fields inside "scoreExplanation".',
      properties: {
        scoreExplanation: {
          type: "string",
          description: "why this score was given",
        },
        score: { type: "number", description: "score between 0 and 1" },
      },
      required: ["scoreExplanation", "score"],
    });
    expect(modelSchema.properties).not.toHaveProperty("reasoning");
    expect(result.output).toEqual({ score: 0.8, reasoning: "Good response" });
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });
});

describe("executeLlmEvaluator", () => {
  it("interpolates a single user prompt message", async () => {
    const callLlm = vi.fn().mockResolvedValue({ score: 1 });

    await executeLlmEvaluator({
      promptMessages: [{ role: "user", content: "legacy {{input}}" }],
      variables: [{ var: "input", value: "prompt" }],
      outputDefinition: createNumericEvalOutputDefinition({
        scoreDescription: "score",
        reasoningDescription: "reasoning",
      }),
      callLlm,
    });

    expect(callLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: "user",
            content: "legacy prompt",
          }),
        ],
      }),
    );
  });

  it("preserves message order and roles while interpolating each message", async () => {
    const callLlm = vi.fn().mockResolvedValue({ score: 1 });

    const result = await executeLlmEvaluator({
      promptMessages: [
        { role: "system", content: "Judge {{input}}" },
        { role: "user", content: "Response: {{output}}" },
        { role: "assistant", content: "Return only the score" },
      ],
      variables: [
        { var: "input", value: "quality" },
        { var: "output", value: "great" },
      ],
      outputDefinition: createNumericEvalOutputDefinition({
        scoreDescription: "score",
        reasoningDescription: "reasoning",
      }),
      callLlm,
    });

    expect(callLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        interpolatedPrompt:
          "Judge quality\n\nResponse: great\n\nReturn only the score",
        messages: [
          expect.objectContaining({ role: "system", content: "Judge quality" }),
          expect.objectContaining({ role: "user", content: "Response: great" }),
          expect.objectContaining({
            role: "assistant",
            content: "Return only the score",
          }),
        ],
      }),
    );
    expect(result.interpolatedPrompt).toBe(
      "Judge quality\n\nResponse: great\n\nReturn only the score",
    );
  });

  it("uses production prompt interpolation and validates the model output", async () => {
    const callLlm = vi.fn().mockResolvedValue({
      score: 0.8,
      reasoning: "The response is relevant.",
    });

    const result = await executeLlmEvaluator({
      promptMessages: [
        {
          role: "user",
          content: "input={{input}} metadata={{metadata}} missing={{missing}}",
        },
      ],
      variables: [
        { var: "input", value: "hello" },
        { var: "metadata", value: { source: "test" } },
      ],
      outputDefinition: createNumericEvalOutputDefinition({
        scoreDescription: "Relevance score",
        reasoningDescription: "Why the response received this score",
      }),
      callLlm,
    });

    expect(callLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            type: "user",
            role: "user",
            content:
              'input=hello metadata={"source":"test"} missing={{missing}}',
          }),
        ],
      }),
    );
    expect(result.output).toEqual({
      success: true,
      data: {
        dataType: "NUMERIC",
        score: 0.8,
        reasoning: "The response is relevant.",
      },
    });
  });
});
