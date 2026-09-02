import {
  createNumericEvalOutputDefinition,
  LLMAdapter,
} from "@langfuse/shared";
import {
  compileLangfuseMediaMessages,
  DefaultEvalModelService,
  findModel,
  generateLLMText,
  resolveConfiguredCodeEvalDispatcher,
  runCodeBasedEvaluationDispatch,
} from "@langfuse/shared/src/server";
import { getObservationForEvalById } from "@/src/features/evals/server/getObservationForEvalById";
import { testEvaluator } from "@/src/features/evals/v2/server/evaluators/testEvaluator";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/features/evals/server/getObservationForEvalById", () => ({
  getObservationForEvalById: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async () => ({
  ...(await vi.importActual("@langfuse/shared/src/server")),
  DefaultEvalModelService: {
    fetchValidModelConfig: vi.fn(),
  },
  compileLangfuseMediaMessages: vi.fn(),
  generateLLMText: vi.fn(),
  findModel: vi.fn(),
  resolveConfiguredCodeEvalDispatcher: vi.fn(),
  runCodeBasedEvaluationDispatch: vi.fn(),
}));

type ValidModelConfig = Extract<
  Awaited<ReturnType<typeof DefaultEvalModelService.fetchValidModelConfig>>,
  { valid: true }
>["config"];

describe("testEvaluator", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getObservationForEvalById).mockResolvedValue({
      output: '{"answer":"It arrives tomorrow."}',
    } as never);
    vi.mocked(DefaultEvalModelService.fetchValidModelConfig).mockResolvedValue({
      valid: true,
      config: {
        provider: "openai-test",
        model: "gpt-4.1-mini",
        modelParams: undefined,
        apiKey: {
          secretKey: "encrypted",
          extraHeaders: null,
          baseURL: "http://127.0.0.1:4011/v1",
          config: null,
          adapter: LLMAdapter.OpenAI,
        },
      } as unknown as ValidModelConfig,
    });
    vi.mocked(compileLangfuseMediaMessages).mockImplementation(
      async ({ messages }) => {
        const mapped = messages.map(({ role, content }) => ({ role, content }));
        return { providerMessages: mapped, traceMessages: mapped } as never;
      },
    );
    vi.mocked(generateLLMText).mockResolvedValue({
      output: { score: 1, reasoning: "Correct" },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as never);
    vi.mocked(findModel).mockResolvedValue({
      model: null,
      pricingTiers: [
        {
          id: "default-tier",
          name: "Default",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [
            {
              usageType: "input",
              price: { mul: () => ({ toNumber: () => 0.001 }) },
            },
            {
              usageType: "output",
              price: { mul: () => ({ toNumber: () => 0.002 }) },
            },
          ],
        },
      ],
    } as never);
  });

  it("loads the selected observation and resolves evaluator variables on the server", async () => {
    const startTime = new Date("2026-08-11T12:00:00.000Z");

    await expect(
      testEvaluator({
        orgId: "org-1",
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        observationId: "observation-1",
        traceId: "trace-1",
        startTime,
        shouldReadFromObservationsTable: true,
        definition: {
          type: "LLM_AS_JUDGE",
          promptMessages: [
            { role: "system", content: "Judge consistently" },
            { role: "user", content: "Judge {{answer}}" },
          ],
          provider: null,
          model: null,
          modelParams: null,
          vars: ["answer"],
          variableMapping: [
            {
              templateVariable: "answer",
              selectedColumnId: "output",
              jsonSelector: "$.answer",
            },
          ],
          outputDefinition: createNumericEvalOutputDefinition({
            scoreDescription: "Correctness",
            reasoningDescription: "Why the answer is correct",
          }),
        },
      }),
    ).resolves.toMatchObject({
      success: true,
      result: { dataType: "NUMERIC", score: 1, reasoning: "Correct" },
      estimatedCostUsd: 0.003,
      durationMs: expect.any(Number),
    });

    expect(getObservationForEvalById).toHaveBeenCalledWith({
      projectId: "project-1",
      id: "observation-1",
      traceId: "trace-1",
      startTime,
      shouldReadFromObservationsTable: true,
    });
    expect(compileLangfuseMediaMessages).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1" }),
    );
    expect(generateLLMText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRetries: 1,
        messages: [
          expect.objectContaining({
            role: "system",
            content: "Judge consistently",
          }),
          expect.objectContaining({
            role: "user",
            content: "Judge It arrives tomorrow.",
          }),
        ],
        traceInput: [
          expect.objectContaining({
            role: "system",
            content: "Judge consistently",
          }),
          expect.objectContaining({
            role: "user",
            content: "Judge It arrives tomorrow.",
          }),
        ],
        trace: expect.objectContaining({
          evaluationContext: {
            evaluatorId: "evaluator-1",
            evaluatorExecutionIsTest: true,
          },
          metadata: expect.objectContaining({
            evaluator_id: "evaluator-1",
            evaluator_test: "true",
            target_trace_id: "trace-1",
            target_observation_id: "observation-1",
          }),
        }),
      }),
    );
  });

  it("treats a missing mapping as empty when the prompt has no variables", async () => {
    await expect(
      testEvaluator({
        orgId: "org-1",
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        observationId: "observation-1",
        traceId: "trace-1",
        startTime: new Date("2026-08-11T12:00:00.000Z"),
        definition: {
          type: "LLM_AS_JUDGE",
          promptMessages: [{ role: "user", content: "Judge this response" }],
          provider: null,
          model: null,
          modelParams: null,
          vars: [],
          variableMapping: null,
          outputDefinition: createNumericEvalOutputDefinition({
            scoreDescription: "Correctness",
            reasoningDescription: "Why the answer is correct",
          }),
        },
      }),
    ).resolves.toMatchObject({ success: true });
  });

  it("rejects a missing mapping when the prompt has variables", async () => {
    await expect(
      testEvaluator({
        orgId: "org-1",
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        observationId: "observation-1",
        traceId: "trace-1",
        startTime: new Date("2026-08-11T12:00:00.000Z"),
        definition: {
          type: "LLM_AS_JUDGE",
          promptMessages: [{ role: "user", content: "Judge {{answer}}" }],
          provider: null,
          model: null,
          modelParams: null,
          vars: ["answer"],
          variableMapping: null,
          outputDefinition: createNumericEvalOutputDefinition({
            scoreDescription: "Correctness",
            reasoningDescription: "Why the answer is correct",
          }),
        },
      }),
    ).rejects.toThrow("Missing mappings for evaluator variables: answer");
  });

  it("loads the selected observation and dispatches a code evaluator with canonical variables", async () => {
    const startTime = new Date("2026-08-11T12:00:00.000Z");
    vi.mocked(getObservationForEvalById).mockResolvedValue({
      input: '{"question":"Where is my order?"}',
      output: '{"answer":"It arrives tomorrow."}',
      metadata: { customerTier: "pro" },
      tool_calls: [],
      tool_call_names: [],
      experiment_item_expected_output: "It arrives tomorrow.",
      experiment_item_metadata: { source: "test" },
    } as never);
    vi.mocked(resolveConfiguredCodeEvalDispatcher).mockReturnValue({
      name: "test-dispatcher",
    } as never);
    vi.mocked(runCodeBasedEvaluationDispatch).mockResolvedValue({
      success: true,
      result: { score: 1 },
      executionTraceId: "execution-trace-1",
      executionTraceFromTimestamp: startTime,
    } as never);

    await expect(
      testEvaluator({
        orgId: "org-1",
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        observationId: "observation-1",
        traceId: "trace-1",
        startTime,
        definition: {
          type: "CODE",
          sourceCode: "return { score: 1 };",
          sourceCodeLanguage: "TYPESCRIPT",
        },
      }),
    ).resolves.toMatchObject({ success: true, result: { score: 1 } });

    expect(runCodeBasedEvaluationDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        projectId: "project-1",
        extractedVariables: [
          { var: "input", value: { question: "Where is my order?" } },
          { var: "output", value: { answer: "It arrives tomorrow." } },
          { var: "metadata", value: { customerTier: "pro" } },
          { var: "toolCalls", value: [] },
          {
            var: "experimentItemExpectedOutput",
            value: "It arrives tomorrow.",
          },
          { var: "experimentItemMetadata", value: { source: "test" } },
        ],
        evaluationContext: {
          evaluatorId: "evaluator-1",
          evaluatorExecutionIsTest: true,
        },
        metadata: expect.objectContaining({
          evaluator_id: "evaluator-1",
          evaluator_test: "true",
          target_trace_id: "trace-1",
          target_observation_id: "observation-1",
        }),
      }),
    );
  });
});
