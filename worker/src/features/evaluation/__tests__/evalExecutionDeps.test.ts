import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";
import { createProductionEvalExecutionDeps } from "../evalExecutionDeps";
import { EXPORT_VOLUME_METRIC } from "../../../services/exportVolumeMetric";

const {
  mockCompileLangfuseMediaMessages,
  mockCreateLLMOutput,
  mockGenerateLLMText,
  mockRecordIncrement,
} = vi.hoisted(() => ({
  mockCompileLangfuseMediaMessages: vi.fn(),
  mockCreateLLMOutput: vi.fn(),
  mockGenerateLLMText: vi.fn(),
  mockRecordIncrement: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...original,
    compileLangfuseMediaMessages: mockCompileLangfuseMediaMessages,
    createLLMOutput: mockCreateLLMOutput,
    generateLLMText: mockGenerateLLMText,
    recordIncrement: mockRecordIncrement,
  };
});

vi.mock("../../../env", async (importOriginal) => {
  const original = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...original,
    env: {
      ...original.env,
      LANGFUSE_MIGRATION_V4_WRITE_MODE: "dual",
    },
  };
});

describe("createProductionEvalExecutionDeps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompileLangfuseMediaMessages.mockImplementation(
      async ({ messages }) => {
        const mapped = messages.map(({ role, content }: any) => ({
          role,
          content,
        }));
        return { providerMessages: mapped, traceMessages: mapped };
      },
    );
    mockCreateLLMOutput.mockImplementation((schema) => ({ schema }));
    mockGenerateLLMText.mockResolvedValue({ output: { completion: "ok" } });
  });

  it("enables internal direct event write for llm-as-a-judge traces", async () => {
    const deps = createProductionEvalExecutionDeps();

    await deps.callLLM({
      messages: [
        {
          role: "user",
          type: "user",
          content: "Judge this answer",
        },
      ],
      modelConfig: {
        provider: "openai",
        model: "gpt-4.1",
        apiKey: {
          adapter: "openai",
          secretKey: "secret",
        },
        adapter: "openai" as any,
        modelParams: {},
      },
      structuredOutputSchema: z.object({
        reasoning: z.string(),
        score: z.number(),
      }),
      traceSinkParams: {
        targetProjectId: "project-123",
        traceId: "trace-123",
        traceName: "Judge trace",
        environment: "langfuse-llm-as-a-judge",
        metadata: {
          score_id: "score-123",
        },
      },
    });

    expect(mockCompileLangfuseMediaMessages).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-123" }),
    );
    expect(mockGenerateLLMText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRetries: 1,
        trace: expect.objectContaining({
          traceId: "trace-123",
          environment: "langfuse-llm-as-a-judge",
          eventsWriter: expect.objectContaining({
            write: expect.any(Function),
          }),
        }),
      }),
    );
  });

  it("renames reasoning only for the model call and maps it back", async () => {
    mockGenerateLLMText.mockResolvedValue({
      output: { score: 0.8, scoreExplanation: "Good response" },
    });
    const deps = createProductionEvalExecutionDeps();
    const structuredOutputSchema = z.object({
      reasoning: z.string().describe("why this score was given"),
      score: z.number().describe("score between 0 and 1"),
    });

    const result = await deps.callLLM({
      messages: [
        {
          role: "user",
          type: "user",
          content: "Judge this answer",
        },
      ],
      modelConfig: {
        provider: "openai",
        model: "gpt-4.1",
        apiKey: { adapter: "openai", secretKey: "secret" },
        adapter: "openai" as any,
        modelParams: {},
      },
      structuredOutputSchema,
      traceSinkParams: {
        targetProjectId: "project-123",
        traceId: "trace-123",
        traceName: "Judge trace",
        environment: "langfuse-llm-as-a-judge",
        metadata: {},
      },
    });

    const modelOutput = mockGenerateLLMText.mock.calls[0][0].output as {
      schema: z.ZodType;
    };
    expect(z.toJSONSchema(modelOutput.schema)).toMatchObject({
      description:
        'Return only top-level "score" and "scoreExplanation". Put other requested fields inside "scoreExplanation".',
      properties: {
        scoreExplanation: { type: "string" },
        score: { type: "number" },
      },
      required: ["scoreExplanation", "score"],
    });
    expect(z.toJSONSchema(modelOutput.schema).properties).not.toHaveProperty(
      "reasoning",
    );
    expect(
      structuredOutputSchema.safeParse({
        score: 0.8,
        reasoning: "Good response",
      }).success,
    ).toBe(true);
    expect(result).toEqual({ score: 0.8, reasoning: "Good response" });
  });

  it("records llmaj export volume using the schema's JSON Schema form", async () => {
    const deps = createProductionEvalExecutionDeps();

    const messages = [
      { role: "user", type: "user", content: "Judge this answer" },
    ];
    const providerMessages = [
      {
        role: "user",
        content: [
          { type: "text", text: "Judge this answer" },
          {
            type: "file",
            data: new Uint8Array([1, 2, 3]),
            mediaType: "image/png",
          },
        ],
      },
    ];
    mockCompileLangfuseMediaMessages.mockResolvedValueOnce({
      providerMessages,
      traceMessages: messages,
    });
    // Production passes a Zod schema, not a plain object.
    const structuredOutputSchema = z.object({
      reasoning: z.string().describe("why this score was given"),
      score: z.number().describe("score between 0 and 1"),
    });

    await deps.callLLM({
      messages: messages as any,
      modelConfig: {
        provider: "openai",
        model: "gpt-4.1",
        apiKey: { adapter: "openai", secretKey: "secret" },
        adapter: "openai" as any,
        modelParams: {},
      },
      structuredOutputSchema: structuredOutputSchema as any,
      traceSinkParams: {
        targetProjectId: "project-123",
        traceId: "trace-123",
        traceName: "Judge trace",
        environment: "langfuse-llm-as-a-judge",
        metadata: {},
      },
    });

    const serializedProviderMessages = JSON.stringify(
      providerMessages,
      (_key, value) =>
        value instanceof Uint8Array
          ? Buffer.from(value).toString("base64")
          : value,
    );
    const modelFacingSchema = z
      .object({
        scoreExplanation: structuredOutputSchema.shape.reasoning,
        score: structuredOutputSchema.shape.score,
      })
      .describe(
        'Return only top-level "score" and "scoreExplanation". Put other requested fields inside "scoreExplanation".',
      );
    const expectedBytes =
      Buffer.byteLength(serializedProviderMessages, "utf8") +
      Buffer.byteLength(
        JSON.stringify(z.toJSONSchema(modelFacingSchema)),
        "utf8",
      );

    expect(expectedBytes).toBeGreaterThan(0);
    expect(mockRecordIncrement).toHaveBeenCalledWith(
      EXPORT_VOLUME_METRIC,
      expectedBytes,
      { integration: "llmaj" },
    );
    // Not the Zod _def form.
    const zodDefBytes = Buffer.byteLength(
      JSON.stringify(modelFacingSchema),
      "utf8",
    );
    expect(expectedBytes).not.toBe(
      Buffer.byteLength(JSON.stringify(messages), "utf8") + zodDefBytes,
    );
  });
});
