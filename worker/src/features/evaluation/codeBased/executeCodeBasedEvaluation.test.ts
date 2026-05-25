import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
} from "@prisma/client";
import {
  CodeEvalDispatcherError,
  CodeEvalDispatcherErrorCodes,
} from "../../../../../packages/shared/src/server/evals/codeEvalDispatcherTypes";
import { CodeEvalExecutionError } from "../../../../../packages/shared/src/server/evals/codeEvalExecution";
import { UnrecoverableError } from "../../../errors/UnrecoverableError";

const mocks = vi.hoisted(() => ({
  dispatcher: {
    name: "test-dispatcher",
    dispatch: vi.fn(),
  },
  writeInternalTrace: vi.fn(),
  createW3CTraceId: vi.fn(() => "execution-trace-1"),
  span: {
    setAttribute: vi.fn(),
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  const { CodeEvalExecutionError, runCodeBasedEvaluationDispatch } =
    await import("../../../../../packages/shared/src/server/evals/codeEvalExecution");

  return {
    ...actual,
    CodeEvalExecutionError,
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
    mocks.writeInternalTrace.mockResolvedValue(undefined);
  });

  it("keeps score names returned by the dispatcher", async () => {
    mocks.dispatcher.dispatch.mockResolvedValue({
      scores: [
        {
          name: "primary-score",
          value: 1,
          dataType: "BOOLEAN",
          metadata: { user: "value" },
        },
        { name: "extra-score", value: "good", dataType: "CATEGORICAL" },
      ],
    });

    const result = await executeCodeBasedEvaluation({
      projectId: "project-1",
      organizationId: "org-1",
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
        sourceCode: "function evaluate() {}",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        prompt: null,
        outputDefinition: null,
      } as any,
      extractedVariables: [
        { var: "input", value: { question: "2+2" } },
        { var: "output", value: "4" },
        { var: "experimentExpectedOutput", value: "4" },
      ],
      hasExperimentContext: true,
      executionMetadata: { job_execution_id: "job-1" },
    });

    expect(result.scores).toMatchObject([
      {
        name: "primary-score",
        value: 1,
        dataType: "BOOLEAN",
        metadata: { user: "value" },
      },
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
              code_eval_source_code: "function evaluate() {}",
            }),
          }),
        ],
      }),
    );
  });

  it("keeps multiple dispatcher-provided score names", async () => {
    mocks.dispatcher.dispatch.mockResolvedValue({
      scores: [
        { name: "boolean-score", value: 1, dataType: "BOOLEAN" },
        { name: "categorical-score", value: "good", dataType: "CATEGORICAL" },
      ],
    });

    const result = await executeCodeBasedEvaluation({
      projectId: "project-1",
      organizationId: "org-1",
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
        sourceCode: "function evaluate() {}",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        prompt: null,
        outputDefinition: null,
      } as any,
      extractedVariables: [],
      executionMetadata: { job_execution_id: "job-1" },
    });

    expect(result.scores).toMatchObject([
      { name: "boolean-score", value: 1, dataType: "BOOLEAN" },
      { name: "categorical-score", value: "good", dataType: "CATEGORICAL" },
    ]);
    expect(mocks.dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          observation: { input: null, output: null, metadata: null },
        },
      }),
    );
  });

  it("passes an empty experiment payload when the source observation has experiment context", async () => {
    mocks.dispatcher.dispatch.mockResolvedValue({
      scores: [{ name: "score", value: 1, dataType: "BOOLEAN" }],
    });

    await executeCodeBasedEvaluation({
      projectId: "project-1",
      organizationId: "org-1",
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
        sourceCode: "function evaluate() {}",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        prompt: null,
        outputDefinition: null,
      } as any,
      extractedVariables: [],
      hasExperimentContext: true,
      executionMetadata: { job_execution_id: "job-1" },
    });

    expect(mocks.dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          observation: { input: null, output: null, metadata: null },
          experiment: {
            expectedOutput: null,
            itemMetadata: null,
          },
        },
      }),
    );
  });

  it("does not infer experiment payload from mapped variables alone", async () => {
    mocks.dispatcher.dispatch.mockResolvedValue({
      scores: [{ name: "score", value: 1, dataType: "BOOLEAN" }],
    });

    await executeCodeBasedEvaluation({
      projectId: "project-1",
      organizationId: "org-1",
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
        sourceCode: "function evaluate() {}",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        prompt: null,
        outputDefinition: null,
      } as any,
      extractedVariables: [{ var: "experimentExpectedOutput", value: "4" }],
      hasExperimentContext: false,
      executionMetadata: { job_execution_id: "job-1" },
    });

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
      scores: [{ name: "score", value: 1, dataType: "BOOLEAN" }],
    });

    await executeCodeBasedEvaluation({
      projectId: "project-1",
      organizationId: "org-1",
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
        sourceCode: "function evaluate() {}",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        prompt: null,
        outputDefinition: null,
      } as any,
      extractedVariables: [
        { var: "output", value: "true" },
        { var: "observationMetadata", value: "42" },
        { var: "experimentExpectedOutput", value: "null" },
      ],
      hasExperimentContext: true,
      executionMetadata: { job_execution_id: "job-1" },
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
      scores: [{ name: "score", value: 1, dataType: "BOOLEAN" }],
    });

    await executeCodeBasedEvaluation({
      projectId: "project-1",
      organizationId: "org-1",
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
        sourceCode: "function evaluate() {}",
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
      hasExperimentContext: true,
      executionMetadata: { job_execution_id: "job-1" },
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
        organizationId: "org-1",
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
          sourceCode: "function evaluate() {}",
          sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
          prompt: null,
          outputDefinition: null,
        } as any,
        extractedVariables: [{ var: "input", value: "prompt" }],
        executionMetadata: { job_execution_id: "job-1" },
      }),
    ).resolves.toMatchObject({
      scores: [{ name: "score", value: 1, dataType: "NUMERIC" }],
      metadata: expect.objectContaining({ dispatcher_name: "test-dispatcher" }),
    });
  });

  it("writes a user-visible error internal trace when code eval execution fails and rethrows", async () => {
    const error = new CodeEvalDispatcherError("runner exploded", {
      code: CodeEvalDispatcherErrorCodes.USER_CODE_ERROR,
      retryable: false,
    });
    mocks.dispatcher.dispatch.mockRejectedValue(error);

    const promise = executeCodeBasedEvaluation({
      projectId: "project-1",
      organizationId: "org-1",
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
        sourceCode: "function evaluate() {}",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        prompt: null,
        outputDefinition: null,
      } as any,
      extractedVariables: [{ var: "input", value: "prompt" }],
      executionMetadata: { job_execution_id: "job-1" },
    });

    await expect(promise).rejects.toThrow(UnrecoverableError);
    await expect(promise).rejects.toThrow("runner exploded");

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
            output: expect.stringContaining("runner exploded"),
            metadata: expect.objectContaining({
              dispatcher_name: "test-dispatcher",
              code_eval_runtime: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
              code_eval_source_code: "function evaluate() {}",
              job_execution_id: "job-1",
              error_name: "CodeEvalDispatcherError",
              error_message: "runner exploded",
              error_code: "USER_CODE_ERROR",
              error_retryable: false,
            }),
          }),
        ],
      }),
    );
  });

  it("writes an actionable user-visible timeout error", async () => {
    const rawTimeoutMessage =
      "Function.TimedOut: Task timed out after 2 seconds";
    const error = new CodeEvalDispatcherError(rawTimeoutMessage, {
      code: CodeEvalDispatcherErrorCodes.TIMEOUT,
      retryable: true,
    });
    mocks.dispatcher.dispatch.mockRejectedValue(error);

    const promise = executeCodeBasedEvaluation({
      projectId: "project-1",
      organizationId: "org-1",
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
        sourceCode: "function evaluate() {}",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        prompt: null,
        outputDefinition: null,
      } as any,
      extractedVariables: [{ var: "input", value: "prompt" }],
      executionMetadata: { job_execution_id: "job-1" },
    });

    await expect(promise).rejects.toThrow(CodeEvalExecutionError);
    await expect(promise).rejects.toMatchObject({
      code: CodeEvalDispatcherErrorCodes.TIMEOUT,
      retryable: true,
    });
    await expect(promise).rejects.toThrow("Evaluator timed out.");

    expect(mocks.writeInternalTrace).toHaveBeenCalledTimes(1);
    const trace = JSON.stringify(mocks.writeInternalTrace.mock.calls[0]?.[0]);
    expect(trace).toContain("Evaluator timed out.");
    expect(trace).toContain(
      "Long executions can be caused by network calls, which are forbidden and may never complete.",
    );
    expect(trace).not.toContain(rawTimeoutMessage);
  });

  it("masks internal dispatcher errors in the internal trace", async () => {
    const error = new CodeEvalDispatcherError(
      "Failed to invoke code eval Lambda code-based-eval-executor-node: ResourceNotFoundException: Function not found",
      {
        code: CodeEvalDispatcherErrorCodes.LAMBDA_CONFIGURATION_ERROR,
        retryable: false,
      },
    );
    mocks.dispatcher.dispatch.mockRejectedValue(error);

    const promise = executeCodeBasedEvaluation({
      projectId: "project-1",
      organizationId: "org-1",
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
        sourceCode: "function evaluate() {}",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        prompt: null,
        outputDefinition: null,
      } as any,
      extractedVariables: [{ var: "input", value: "prompt" }],
      executionMetadata: { job_execution_id: "job-1" },
    });

    await expect(promise).rejects.toThrow(UnrecoverableError);
    await expect(promise).rejects.toThrow("An internal error occurred");

    expect(mocks.writeInternalTrace).toHaveBeenCalledTimes(1);
    expect(mocks.writeInternalTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        eventInputs: [
          expect.objectContaining({
            level: "ERROR",
            statusMessage:
              "Code eval execution failed: An internal error occurred",
            output: expect.stringContaining("An internal error occurred"),
            metadata: expect.objectContaining({
              error_name: "CodeEvalDispatcherError",
              error_message: "An internal error occurred",
              error_code:
                CodeEvalDispatcherErrorCodes.LAMBDA_CONFIGURATION_ERROR,
              error_public_code: "INTERNAL_ERROR",
              error_retryable: false,
            }),
          }),
        ],
      }),
    );
  });
});
