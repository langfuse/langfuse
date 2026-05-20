import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
} from "@prisma/client";

const mocks = vi.hoisted(() => ({
  dispatcher: {
    name: "test-dispatcher",
    dispatch: vi.fn(),
  },
  projectFindUnique: vi.fn(),
  writeInternalTrace: vi.fn(),
  createW3CTraceId: vi.fn(() => "execution-trace-1"),
  span: {
    setAttribute: vi.fn(),
  },
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    project: {
      findUnique: mocks.projectFindUnique,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  const { runCodeBasedEvaluationDispatch } =
    await import("../../../../../packages/shared/src/server/evals/codeEvalExecution");

  return {
    ...actual,
    INTERNAL_TRACE_EVENT_SOURCE: "test-source",
    LangfuseInternalTraceEnvironment: { CodeEval: "langfuse-code-eval" },
    instrumentAsync: vi.fn(async (_options, fn) => fn(mocks.span)),
    logger: { debug: vi.fn(), warn: vi.fn() },
    createW3CTraceId: mocks.createW3CTraceId,
    runCodeBasedEvaluationDispatch,
    resolveConfiguredCodeEvalDispatcher: vi.fn(() => mocks.dispatcher),
  };
});

vi.mock("../../internal-tracing/createInternalEventsWriter", () => ({
  createInternalEventsWriter: () => ({ write: mocks.writeInternalTrace }),
}));

import { executeCodeBasedEvaluation } from "./executeCodeBasedEvaluation";

describe("executeCodeBasedEvaluation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectFindUnique.mockResolvedValue({ orgId: "org-1" });
  });

  it("defaults the first missing score name to the score config name and keeps additional names", async () => {
    mocks.dispatcher.dispatch.mockResolvedValue({
      scores: [
        { value: 1, dataType: "BOOLEAN", metadata: { user: "value" } },
        { name: "extra-score", value: "good", dataType: "CATEGORICAL" },
      ],
    });

    const result = await executeCodeBasedEvaluation({
      projectId: "project-1",
      jobExecutionId: "job-1",
      job: {
        id: "job-1",
        jobConfigurationId: "config-1",
        jobInputTraceId: "trace-1",
        jobInputObservationId: "obs-1",
        jobInputDatasetItemId: null,
      } as any,
      config: {
        id: "config-1",
        scoreName: "default-score",
      } as any,
      template: {
        id: "template-1",
        name: "Code evaluator",
        type: EvalTemplateType.CODE,
        version: 1,
        sourceCode: "export function evaluate() {}",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        prompt: null,
        outputDefinition: null,
      } as any,
      extractedVariables: [
        { var: "input", value: { question: "2+2" } },
        { var: "output", value: "4" },
        { var: "experimentExpectedOutput", value: "4" },
      ],
      environment: "default",
      metadata: { job_execution_id: "job-1" },
    });

    expect(result.scores).toMatchObject([
      { name: "default-score", value: 1, dataType: "BOOLEAN" },
      { name: "extra-score", value: "good", dataType: "CATEGORICAL" },
    ]);
    expect(mocks.span.setAttribute).toHaveBeenCalledWith("eval.score.count", 2);
    const expectedPayload = expect.objectContaining({
      observation: {
        input: { question: "2+2" },
        output: "4",
        metadata: null,
      },
      experiment: {
        expectedOutput: "4",
        itemMetadata: null,
      },
    });
    expect(mocks.dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.objectContaining({ organizationId: "org-1" }),
        payload: expectedPayload,
      }),
    );
    expect(mocks.writeInternalTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        eventInputs: [
          expect.objectContaining({
            projectId: "project-1",
            traceName: "Execute evaluator: Code evaluator",
            name: "Execute evaluator: Code evaluator",
            type: "SPAN",
            environment: "langfuse-code-eval",
            metadata: expect.objectContaining({
              code_eval_runtime: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
              code_eval_source_code: "export function evaluate() {}",
            }),
          }),
        ],
      }),
    );
  });

  it("defaults every unnamed score to the score config name", async () => {
    mocks.dispatcher.dispatch.mockResolvedValue({
      scores: [
        { value: 1, dataType: "BOOLEAN" },
        { value: "good", dataType: "CATEGORICAL" },
      ],
    });

    const result = await executeCodeBasedEvaluation({
      projectId: "project-1",
      jobExecutionId: "job-1",
      job: {
        id: "job-1",
        jobConfigurationId: "config-1",
        jobInputTraceId: "trace-1",
        jobInputObservationId: "obs-1",
        jobInputDatasetItemId: null,
      } as any,
      config: {
        id: "config-1",
        scoreName: "default-score",
      } as any,
      template: {
        id: "template-1",
        type: EvalTemplateType.CODE,
        version: 1,
        sourceCode: "export function evaluate() {}",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        prompt: null,
        outputDefinition: null,
      } as any,
      extractedVariables: [],
      environment: "default",
      metadata: { job_execution_id: "job-1" },
    });

    expect(result.scores).toMatchObject([
      { name: "default-score", value: 1, dataType: "BOOLEAN" },
      { name: "default-score", value: "good", dataType: "CATEGORICAL" },
    ]);
    expect(mocks.dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          observation: { input: null, output: null, metadata: null },
        },
      }),
    );
  });

  it("passes extracted variable values through to the dispatcher payload as-is", async () => {
    mocks.dispatcher.dispatch.mockResolvedValue({
      scores: [{ value: 1, dataType: "BOOLEAN" }],
    });

    await executeCodeBasedEvaluation({
      projectId: "project-1",
      jobExecutionId: "job-1",
      job: {
        id: "job-1",
        jobConfigurationId: "config-1",
        jobInputTraceId: "trace-1",
        jobInputObservationId: "obs-1",
        jobInputDatasetItemId: null,
      } as any,
      config: { id: "config-1", scoreName: "default-score" } as any,
      template: {
        id: "template-1",
        type: EvalTemplateType.CODE,
        version: 1,
        sourceCode: "export function evaluate() {}",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        prompt: null,
        outputDefinition: null,
      } as any,
      extractedVariables: [
        { var: "output", value: "true" },
        { var: "observationMetadata", value: "42" },
        { var: "experimentExpectedOutput", value: "null" },
      ],
      environment: "default",
      metadata: { job_execution_id: "job-1" },
    });

    expect(mocks.dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          observation: {
            input: null,
            output: "true",
            metadata: "42",
          },
          experiment: {
            expectedOutput: "null",
            itemMetadata: null,
          },
        }),
      }),
    );
  });

  it("passes experiment item metadata through without expected output", async () => {
    mocks.dispatcher.dispatch.mockResolvedValue({
      scores: [{ value: 1, dataType: "BOOLEAN" }],
    });

    await executeCodeBasedEvaluation({
      projectId: "project-1",
      jobExecutionId: "job-1",
      job: {
        id: "job-1",
        jobConfigurationId: "config-1",
        jobInputTraceId: "trace-1",
        jobInputObservationId: "obs-1",
        jobInputDatasetItemId: null,
      } as any,
      config: { id: "config-1", scoreName: "default-score" } as any,
      template: {
        id: "template-1",
        type: EvalTemplateType.CODE,
        version: 1,
        sourceCode: "export function evaluate() {}",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        prompt: null,
        outputDefinition: null,
      } as any,
      extractedVariables: [
        {
          var: "experimentItemMetadata",
          value: { difficulty: "easy", source: "dataset" },
        },
      ],
      environment: "default",
      metadata: { job_execution_id: "job-1" },
    });

    expect(mocks.dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          observation: {
            input: null,
            output: null,
            metadata: null,
          },
          experiment: {
            expectedOutput: null,
            itemMetadata: { difficulty: "easy", source: "dataset" },
          },
        }),
      }),
    );
  });

  it("continues successful execution when writing the internal trace fails", async () => {
    mocks.dispatcher.dispatch.mockResolvedValue({
      scores: [{ name: "score", value: 1, dataType: "NUMERIC" }],
    });
    mocks.writeInternalTrace.mockRejectedValue(new Error("trace write failed"));

    await expect(
      executeCodeBasedEvaluation({
        projectId: "project-1",
        jobExecutionId: "job-1",
        job: {
          id: "job-1",
          jobConfigurationId: "config-1",
          jobInputTraceId: "trace-1",
          jobInputObservationId: "obs-1",
          jobInputDatasetItemId: null,
        } as any,
        config: { id: "config-1", scoreName: "default-score" } as any,
        template: {
          id: "template-1",
          name: "Code evaluator",
          type: EvalTemplateType.CODE,
          version: 1,
          sourceCode: "export function evaluate() {}",
          sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
          prompt: null,
          outputDefinition: null,
        } as any,
        extractedVariables: [{ var: "input", value: "prompt" }],
        environment: "default",
        metadata: { job_execution_id: "job-1" },
      }),
    ).resolves.toMatchObject({
      scores: [{ name: "score", value: 1, dataType: "NUMERIC" }],
      metadata: expect.objectContaining({ dispatcher_name: "test-dispatcher" }),
    });
  });

  it("writes an error internal trace when code eval execution fails and rethrows", async () => {
    const error = Object.assign(new Error("runner exploded"), {
      code: "USER_CODE_ERROR",
      retryable: false,
    });
    mocks.dispatcher.dispatch.mockRejectedValue(error);

    await expect(
      executeCodeBasedEvaluation({
        projectId: "project-1",
        jobExecutionId: "job-1",
        job: {
          id: "job-1",
          jobConfigurationId: "config-1",
          jobInputTraceId: "trace-1",
          jobInputObservationId: "obs-1",
          jobInputDatasetItemId: null,
        } as any,
        config: { id: "config-1", scoreName: "default-score" } as any,
        template: {
          id: "template-1",
          name: "Code evaluator",
          type: EvalTemplateType.CODE,
          version: 1,
          sourceCode: "export function evaluate() {}",
          sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
          prompt: null,
          outputDefinition: null,
        } as any,
        extractedVariables: [{ var: "input", value: "prompt" }],
        environment: "default",
        metadata: { job_execution_id: "job-1" },
      }),
    ).rejects.toBe(error);

    expect(mocks.writeInternalTrace).toHaveBeenCalledTimes(1);
    expect(mocks.writeInternalTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        eventInputs: [
          expect.objectContaining({
            projectId: "project-1",
            traceName: "Execute evaluator: Code evaluator",
            name: "Execute evaluator: Code evaluator",
            type: "SPAN",
            environment: "langfuse-code-eval",
            level: "ERROR",
            statusMessage: "Code eval execution failed: runner exploded",
            input: JSON.stringify({
              observation: { input: "prompt", output: null, metadata: null },
            }),
            output: JSON.stringify({
              error: {
                name: "Error",
                message: "runner exploded",
                code: "USER_CODE_ERROR",
                retryable: false,
              },
            }),
            metadata: expect.objectContaining({
              dispatcher_name: "test-dispatcher",
              code_eval_runtime: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
              code_eval_source_code: "export function evaluate() {}",
              job_execution_id: "job-1",
              error_name: "Error",
              error_message: "runner exploded",
              error_code: "USER_CODE_ERROR",
              error_retryable: false,
            }),
          }),
        ],
      }),
    );
  });
});
