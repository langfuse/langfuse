import { describe, expect, it, vi, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { z } from "zod";
import { classifyEvaluatorLlmError, redis } from "@langfuse/shared/src/server";
import { createProductionEvalExecutionDeps } from "../evalExecutionDeps";
import { EXPORT_VOLUME_METRIC } from "../../../services/exportVolumeMetric";

const {
  mockGenerateLlmEvaluatorOutput,
  mockRecordIncrement,
  mockIngestionQueueAdd,
} = vi.hoisted(() => ({
  mockGenerateLlmEvaluatorOutput: vi.fn(),
  mockRecordIncrement: vi.fn(),
  mockIngestionQueueAdd: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...original,
    generateLlmEvaluatorOutput: mockGenerateLlmEvaluatorOutput,
    recordIncrement: mockRecordIncrement,
    IngestionQueue: {
      getInstance: () => ({ add: mockIngestionQueueAdd }),
    },
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

const modelConfig = {
  provider: "openai",
  model: "gpt-4.1",
  apiKey: { adapter: "openai", secretKey: "secret" },
  adapter: "openai" as any,
  modelParams: {},
};

const traceSinkParams = {
  targetProjectId: "project-123",
  traceId: "trace-123",
  traceName: "Judge trace",
  environment: "langfuse-llm-as-a-judge",
  metadata: { score_id: "score-123" },
};

const structuredOutputSchema = z.object({
  reasoning: z.string().describe("why this score was given"),
  score: z.number().describe("score between 0 and 1"),
});

describe("createProductionEvalExecutionDeps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateLlmEvaluatorOutput.mockResolvedValue({
      output: { score: 0.8, reasoning: "Good response" },
      usage: {},
      providerMessages: [],
      modelFacingOutputSchema: structuredOutputSchema,
    });
  });

  it("calls the shared evaluator model call with direct event writes", async () => {
    const deps = createProductionEvalExecutionDeps();

    const result = await deps.callLLM({
      messages: [{ role: "user", type: "user", content: "Judge this answer" }],
      modelConfig,
      structuredOutputSchema,
      traceSinkParams,
    } as any);

    expect(mockGenerateLlmEvaluatorOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-123",
        outputResultSchema: structuredOutputSchema,
        trace: expect.objectContaining({
          traceId: "trace-123",
          environment: "langfuse-llm-as-a-judge",
          eventsWriter: expect.objectContaining({
            write: expect.any(Function),
          }),
        }),
      }),
    );
    expect(result).toEqual({ score: 0.8, reasoning: "Good response" });
  });

  it("records llmaj export volume using the schema's JSON Schema form", async () => {
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
    // Production passes a Zod schema, not a plain object.
    const modelFacingSchema = z
      .object({
        scoreExplanation: structuredOutputSchema.shape.reasoning,
        score: structuredOutputSchema.shape.score,
      })
      .describe("model-facing schema");
    mockGenerateLlmEvaluatorOutput.mockResolvedValueOnce({
      output: { score: 0.8, reasoning: "Good response" },
      usage: {},
      providerMessages,
      modelFacingOutputSchema: modelFacingSchema,
    });
    const deps = createProductionEvalExecutionDeps();

    await deps.callLLM({
      messages: [{ role: "user", type: "user", content: "Judge this answer" }],
      modelConfig,
      structuredOutputSchema,
      traceSinkParams,
    } as any);

    const serializedProviderMessages = JSON.stringify(
      providerMessages,
      (_key, value) =>
        value instanceof Uint8Array
          ? Buffer.from(value).toString("base64")
          : value,
    );
    const expectedBytes =
      Buffer.byteLength(serializedProviderMessages, "utf8") +
      Buffer.byteLength(
        JSON.stringify(z.toJSONSchema(modelFacingSchema)),
        "utf8",
      );

    expect(mockRecordIncrement).toHaveBeenCalledWith(
      EXPORT_VOLUME_METRIC,
      expectedBytes,
      { integration: "llmaj" },
    );
    // Not the Zod _def form.
    expect(expectedBytes).not.toBe(
      Buffer.byteLength(serializedProviderMessages, "utf8") +
        Buffer.byteLength(JSON.stringify(modelFacingSchema), "utf8"),
    );
  });

  it("does not record export volume when the model call fails", async () => {
    mockGenerateLlmEvaluatorOutput.mockRejectedValueOnce(new Error("boom"));
    const deps = createProductionEvalExecutionDeps();

    await expect(
      deps.callLLM({
        messages: [
          { role: "user", type: "user", content: "Judge this answer" },
        ],
        modelConfig,
        structuredOutputSchema,
        traceSinkParams,
      } as any),
    ).rejects.toThrow("boom");
    expect(mockRecordIncrement).not.toHaveBeenCalled();
  });

  it("pauses a connection's model after a provider 429, leaving its other models running", async () => {
    const llmApiKeyId = randomUUID();
    const cooldownKey = `llm-connection-cooldown:${llmApiKeyId}:gpt-4.1`;
    if (redis?.status !== "ready") {
      await new Promise((resolve) => redis?.once("ready", resolve));
    }
    // The AI SDK identifies an APICallError by these markers.
    const providerRateLimit = Object.assign(
      new Error("per-key concurrency limit reached"),
      {
        [Symbol.for("vercel.ai.error")]: true,
        [Symbol.for("vercel.ai.error.AI_APICallError")]: true,
        name: "AI_APICallError",
        statusCode: 429,
        isRetryable: true,
        responseHeaders: { "retry-after": "7" },
      },
    );
    mockGenerateLlmEvaluatorOutput.mockRejectedValueOnce(providerRateLimit);
    const deps = createProductionEvalExecutionDeps();
    const params = {
      messages: [{ role: "user", type: "user", content: "Judge this answer" }],
      modelConfig: {
        ...modelConfig,
        apiKey: { ...modelConfig.apiKey, id: llmApiKeyId },
      },
      structuredOutputSchema,
      traceSinkParams,
    } as any;

    try {
      await expect(deps.callLLM(params)).rejects.toBe(providerRateLimit);
      const cooldownError = await deps.callLLM(params).catch((e) => e);
      await deps.callLLM({
        ...params,
        modelConfig: { ...params.modelConfig, model: "gpt-4.1-mini" },
      });

      expect(mockGenerateLlmEvaluatorOutput).toHaveBeenCalledTimes(2);
      expect(
        mockGenerateLlmEvaluatorOutput.mock.calls[1][0].modelParams.model,
      ).toBe("gpt-4.1-mini");
      expect(classifyEvaluatorLlmError(cooldownError)).toMatchObject({
        statusCode: 429,
        isRetryable: true,
        blockReason: null,
      });
      const cooldownMs = await redis?.pttl(cooldownKey);
      expect(cooldownMs).toBeGreaterThan(5_000);
      expect(cooldownMs).toBeLessThanOrEqual(7_000);
    } finally {
      await redis?.del(cooldownKey);
    }
  });

  it("does not pause a model when one request exceeds its token limit", async () => {
    const llmApiKeyId = randomUUID();
    if (redis?.status !== "ready") {
      await new Promise((resolve) => redis?.once("ready", resolve));
    }
    const requestTooLarge = Object.assign(
      new Error(
        "Request too large for gpt-4.1 on tokens per min (TPM): Limit 30000, Requested 50000.",
      ),
      {
        [Symbol.for("vercel.ai.error")]: true,
        [Symbol.for("vercel.ai.error.AI_APICallError")]: true,
        name: "AI_APICallError",
        statusCode: 429,
        isRetryable: true,
      },
    );
    mockGenerateLlmEvaluatorOutput.mockRejectedValueOnce(requestTooLarge);
    const deps = createProductionEvalExecutionDeps();

    await expect(
      deps.callLLM({
        messages: [{ role: "user", type: "user", content: "Judge this" }],
        modelConfig: {
          ...modelConfig,
          apiKey: { ...modelConfig.apiKey, id: llmApiKeyId },
        },
        structuredOutputSchema,
        traceSinkParams,
      } as any),
    ).rejects.toBe(requestTooLarge);

    expect(
      await redis?.exists(`llm-connection-cooldown:${llmApiKeyId}:gpt-4.1`),
    ).toBe(0);
  });

  it("enqueues eval scores to read only their own S3 file", async () => {
    const deps = createProductionEvalExecutionDeps();

    await deps.enqueueScoreIngestion({
      projectId: "project-123",
      scoreId: "score-123",
      eventId: "event-123",
    });

    expect(mockIngestionQueueAdd).toHaveBeenCalledTimes(1);
    const [, job] = mockIngestionQueueAdd.mock.calls[0];
    expect(job.payload.data).toEqual(
      expect.objectContaining({
        type: "score-create",
        eventBodyId: "score-123",
        fileKey: "event-123",
        skipS3List: true,
      }),
    );
  });
});
