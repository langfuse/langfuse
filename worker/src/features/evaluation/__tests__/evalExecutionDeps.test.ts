import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";
import { createProductionEvalExecutionDeps } from "../evalExecutionDeps";
import { EXPORT_VOLUME_METRIC } from "../../../services/exportVolumeMetric";

const {
  mockCompileLangfuseMediaMessages,
  mockGenerateLLMText,
  mockRecordIncrement,
} = vi.hoisted(() => ({
  mockCompileLangfuseMediaMessages: vi.fn(),
  mockGenerateLLMText: vi.fn(),
  mockRecordIncrement: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...original,
    compileLangfuseMediaMessages: mockCompileLangfuseMediaMessages,
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
      structuredOutputSchema: {} as any,
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
    const expectedBytes =
      Buffer.byteLength(serializedProviderMessages, "utf8") +
      Buffer.byteLength(
        JSON.stringify(z.toJSONSchema(structuredOutputSchema)),
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
      JSON.stringify(structuredOutputSchema),
      "utf8",
    );
    expect(expectedBytes).not.toBe(
      Buffer.byteLength(JSON.stringify(messages), "utf8") + zodDefBytes,
    );
  });
});
