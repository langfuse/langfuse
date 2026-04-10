import { describe, expect, it, vi, beforeEach } from "vitest";
import { createProductionEvalExecutionDeps } from "../evalExecutionDeps";

const { mockFetchLLMCompletion } = vi.hoisted(() => ({
  mockFetchLLMCompletion: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...original,
    fetchLLMCompletion: mockFetchLLMCompletion,
  };
});

vi.mock("../../../env", async (importOriginal) => {
  const original = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...original,
    env: {
      ...original.env,
      LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE: "true",
    },
  };
});

describe("createProductionEvalExecutionDeps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchLLMCompletion.mockResolvedValue({ completion: "ok" });
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

    expect(mockFetchLLMCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        traceSinkParams: expect.objectContaining({
          traceId: "trace-123",
          environment: "langfuse-llm-as-a-judge",
          eventsWriter: expect.objectContaining({
            write: expect.any(Function),
          }),
        }),
      }),
    );
  });
});
