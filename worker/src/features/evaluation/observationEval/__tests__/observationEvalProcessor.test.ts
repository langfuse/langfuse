import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
  JobConfigState,
  JobExecutionStatus,
} from "@prisma/client";
import {
  processObservationEval,
  type ObservationEvalProcessorDeps,
} from "../observationEvalProcessor";
import {
  createTestObservation,
  createMockJobExecution,
  createMockJobConfiguration,
  createMockEvalTemplate,
  createMockProcessorDeps,
} from "./fixtures";
import { UnrecoverableError } from "../../../../errors/UnrecoverableError";

// Mock prisma
vi.mock("@langfuse/shared/src/db", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/db");

  return {
    ...actual,
    prisma: {
      jobExecution: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      jobConfiguration: {
        findFirst: vi.fn(),
      },
    },
  };
});

// Mock runLLMAsJudgeEvaluation
vi.mock("../../evalService", () => ({
  runLLMAsJudgeEvaluation: vi.fn(),
}));

vi.mock("../../codeBased", () => ({
  executeCodeBasedEvaluation: vi.fn(),
}));

// Mock logger
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  const { extractObservationVariables } =
    await import("../../../../../../packages/shared/src/server/evals/extractObservationVariables");
  const { buildDeterministicEvalScoreIds } =
    await import("../../../../../../packages/shared/src/server/evals/evalScoreIds");
  return {
    ...actual,
    buildDeterministicEvalScoreIds,
    extractObservationVariables,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    DEFAULT_TRACE_ENVIRONMENT: "default",
  };
});

import { prisma } from "@langfuse/shared/src/db";
import { executeCodeBasedEvaluation } from "../../codeBased";
import {
  createMockEvalExecutionDeps,
  type EvalExecutionDeps,
} from "../../evalExecutionDeps";
import { runLLMAsJudgeEvaluation } from "../../evalService";
import { createDeterministicEvalScoreId } from "../../../../../../packages/shared/src/server/evals/evalScoreIds";

const mockScoreId = createDeterministicEvalScoreId({
  jobExecutionId: "job-exec-456",
  scoreName: "test-score",
  occurrenceIndex: 0,
});

const mockEvalExecutionResult = {
  scores: [
    {
      dataType: "NUMERIC" as const,
      value: 0.5,
      name: "test-score",
      comment: "Mock eval result",
    },
  ],
  executionTraceId: "trace-123",
  metadata: {},
};

describe("processObservationEval", () => {
  const projectId = "test-project-123";
  const jobExecutionId = "job-exec-456";
  const observationS3Path = "evals/test-project-123/observations/obs-789.json";

  const baseEvent = {
    projectId,
    jobExecutionId,
    observationS3Path,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (executeCodeBasedEvaluation as Mock).mockResolvedValue(
      mockEvalExecutionResult,
    );
    (runLLMAsJudgeEvaluation as Mock).mockResolvedValue(
      mockEvalExecutionResult,
    );
  });

  describe("job execution lookup", () => {
    it("should return early when job execution is not found", async () => {
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(null);

      const deps = createMockProcessorDeps();

      await processObservationEval({
        event: baseEvent,
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps,
      });

      expect(prisma.jobExecution.findFirst).toHaveBeenCalledWith({
        where: {
          id: jobExecutionId,
          projectId,
        },
      });
      expect(deps.downloadObservationFromS3).not.toHaveBeenCalled();
      expect(runLLMAsJudgeEvaluation).not.toHaveBeenCalled();
    });
  });

  describe("job configuration lookup", () => {
    it("should throw UnrecoverableError when job configuration is not found", async () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
      });
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(null);

      const deps = createMockProcessorDeps();

      await expect(
        processObservationEval({
          event: baseEvent,
          executionType: EvalTemplateType.LLM_AS_JUDGE,
          deps,
        }),
      ).rejects.toThrow(UnrecoverableError);
      await expect(
        processObservationEval({
          event: baseEvent,
          executionType: EvalTemplateType.LLM_AS_JUDGE,
          deps,
        }),
      ).rejects.toThrow("Job configuration or template not found");
    });

    it("should throw UnrecoverableError when evalTemplate is null", async () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
      });
      const configWithoutTemplate = createMockJobConfiguration({
        id: "config-123",
        projectId,
        evalTemplate: null,
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(
        configWithoutTemplate,
      );

      const deps = createMockProcessorDeps();

      await expect(
        processObservationEval({
          event: baseEvent,
          executionType: EvalTemplateType.LLM_AS_JUDGE,
          deps,
        }),
      ).rejects.toThrow(UnrecoverableError);
    });

    it("should cancel the job when the evaluator is blocked", async () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
      });
      const config = createMockJobConfiguration({
        id: "config-123",
        projectId,
        blockedAt: new Date(),
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(config);

      const deps = createMockProcessorDeps();

      await processObservationEval({
        event: baseEvent,
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps,
      });

      expect(prisma.jobExecution.update).toHaveBeenCalledWith({
        where: {
          id: job.id,
          projectId,
        },
        data: {
          status: JobExecutionStatus.CANCELLED,
          endTime: expect.any(Date),
        },
      });
      expect(deps.downloadObservationFromS3).not.toHaveBeenCalled();
      expect(runLLMAsJudgeEvaluation).not.toHaveBeenCalled();
    });
  });

  describe("template type filtering", () => {
    it("should throw UnrecoverableError when no template matches the requested execution type", async () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(null);

      const deps = createMockProcessorDeps();

      await expect(
        processObservationEval({
          event: baseEvent,
          executionType: EvalTemplateType.LLM_AS_JUDGE,
          deps,
        }),
      ).rejects.toThrow(UnrecoverableError);
      expect(prisma.jobConfiguration.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            evalTemplate: {
              is: {
                type: EvalTemplateType.LLM_AS_JUDGE,
              },
            },
          }),
        }),
      );
      expect(deps.downloadObservationFromS3).not.toHaveBeenCalled();
      expect(runLLMAsJudgeEvaluation).not.toHaveBeenCalled();
    });

    it("should cancel inactive evaluators when execution mode is omitted", async () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
      });
      const config = createMockJobConfiguration({
        id: "config-123",
        projectId,
        status: JobConfigState.INACTIVE,
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(config);

      const deps = createMockProcessorDeps();

      await processObservationEval({
        event: baseEvent,
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps,
      });

      expect(prisma.jobExecution.update).toHaveBeenCalledWith({
        where: {
          id: job.id,
          projectId,
        },
        data: {
          status: JobExecutionStatus.CANCELLED,
          endTime: expect.any(Date),
        },
      });
      expect(deps.downloadObservationFromS3).not.toHaveBeenCalled();
      expect(runLLMAsJudgeEvaluation).not.toHaveBeenCalled();
    });

    it("should execute inactive evaluators for manual execution", async () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
      });
      const config = createMockJobConfiguration({
        id: "config-123",
        projectId,
        status: JobConfigState.INACTIVE,
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(config);

      const deps = createMockProcessorDeps();

      await processObservationEval({
        event: { ...baseEvent, executionMode: "MANUAL" },
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps,
      });

      expect(prisma.jobExecution.update).not.toHaveBeenCalled();
      expect(deps.downloadObservationFromS3).toHaveBeenCalledWith(
        observationS3Path,
      );
      expect(runLLMAsJudgeEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          jobExecutionId,
          job: expect.objectContaining({ id: jobExecutionId }),
          config: expect.objectContaining({ id: "config-123" }),
        }),
      );
    });
  });

  describe("S3 download", () => {
    it("should throw error when S3 download fails (retryable)", async () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
      });
      const config = createMockJobConfiguration({
        id: "config-123",
        projectId,
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(config);

      const deps = createMockProcessorDeps({
        downloadObservationFromS3: vi
          .fn<ObservationEvalProcessorDeps["downloadObservationFromS3"]>()
          .mockRejectedValue(new Error("S3 connection failed")),
      });

      // S3 connection errors should be retryable (not UnrecoverableError)
      await expect(
        processObservationEval({
          event: baseEvent,
          executionType: EvalTemplateType.LLM_AS_JUDGE,
          deps,
        }),
      ).rejects.toThrow("Failed to download observation from S3");
    });

    it("should throw UnrecoverableError when S3 data is invalid JSON", async () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
      });
      const config = createMockJobConfiguration({
        id: "config-123",
        projectId,
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(config);

      const deps = createMockProcessorDeps({
        downloadObservationFromS3: vi
          .fn<ObservationEvalProcessorDeps["downloadObservationFromS3"]>()
          .mockResolvedValue("not valid json {"),
      });

      // Invalid JSON is a permanent error - should be UnrecoverableError
      await expect(
        processObservationEval({
          event: baseEvent,
          executionType: EvalTemplateType.LLM_AS_JUDGE,
          deps,
        }),
      ).rejects.toThrow(UnrecoverableError);
    });

    it("should throw UnrecoverableError when S3 data fails schema validation", async () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
      });
      const config = createMockJobConfiguration({
        id: "config-123",
        projectId,
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(config);

      // Missing required fields - valid JSON but invalid schema
      const invalidObservation = { id: "obs-123", someField: "value" };
      const deps = createMockProcessorDeps({
        downloadObservationFromS3: vi
          .fn<ObservationEvalProcessorDeps["downloadObservationFromS3"]>()
          .mockResolvedValue(JSON.stringify(invalidObservation)),
      });

      // Schema validation failures are permanent - should be UnrecoverableError
      await expect(
        processObservationEval({
          event: baseEvent,
          executionType: EvalTemplateType.LLM_AS_JUDGE,
          deps,
        }),
      ).rejects.toThrow(UnrecoverableError);
    });
  });

  describe("successful execution", () => {
    it("should call runLLMAsJudgeEvaluation with correct parameters", async () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
        jobInputTraceId: "trace-abc",
        jobInputObservationId: "obs-xyz",
      });
      const template = createMockEvalTemplate({
        id: "template-456",
        projectId,
        prompt: "Evaluate: {{output}}",
      });
      const config = createMockJobConfiguration({
        id: "config-123",
        projectId,
        evalTemplateId: "template-456",
        variableMapping: [
          { templateVariable: "output", selectedColumnId: "output" },
        ],
        evalTemplate: template,
      });
      const observation = createTestObservation({
        span_id: "obs-xyz",
        project_id: projectId,
        trace_id: "trace-abc",
        experiment_id: "experiment-123",
        environment: "production",
        output: '{"response": "test output"}',
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(config);

      const deps = createMockProcessorDeps({
        downloadObservationFromS3: vi
          .fn()
          .mockResolvedValue(JSON.stringify(observation)),
      });

      await processObservationEval({
        event: baseEvent,
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps,
      });

      expect(prisma.jobConfiguration.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            evalTemplate: {
              is: {
                type: EvalTemplateType.LLM_AS_JUDGE,
              },
            },
          }),
        }),
      );
      expect(runLLMAsJudgeEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          organizationId: "test-org-123",
          jobExecutionId,
          job: expect.objectContaining({ id: jobExecutionId }),
          config: expect.objectContaining({ id: "config-123" }),
          template: expect.objectContaining({ id: "template-456" }),
          extractedVariables: expect.arrayContaining([
            expect.objectContaining({
              var: "output",
              value: '{"response": "test output"}',
            }),
          ]),
          hasExperimentContext: true,
        }),
      );
    });

    it("should complete eval execution with the executor result", async () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
        jobInputTraceId: "trace-abc",
        jobInputObservationId: "obs-xyz",
      });
      const template = createMockEvalTemplate({
        id: "template-456",
        projectId,
        prompt: "Evaluate: {{output}}",
      });
      const config = createMockJobConfiguration({
        id: "config-123",
        projectId,
        evalTemplateId: "template-456",
        variableMapping: [
          { templateVariable: "output", selectedColumnId: "output" },
        ],
        evalTemplate: template,
      });
      const observation = createTestObservation({
        span_id: "obs-xyz",
        project_id: projectId,
        trace_id: "trace-abc",
        environment: "production",
        output: '{"response": "test output"}',
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(config);

      const uploadScore = vi
        .fn<EvalExecutionDeps["uploadScore"]>()
        .mockResolvedValue(undefined);
      const enqueueScoreIngestion = vi
        .fn<EvalExecutionDeps["enqueueScoreIngestion"]>()
        .mockResolvedValue(undefined);
      const updateJobExecution = vi
        .fn<EvalExecutionDeps["updateJobExecution"]>()
        .mockResolvedValue(undefined);
      const deps = createMockProcessorDeps({
        downloadObservationFromS3: vi
          .fn()
          .mockResolvedValue(JSON.stringify(observation)),
        evalExecutionDeps: createMockEvalExecutionDeps({
          uploadScore,
          enqueueScoreIngestion,
          updateJobExecution,
        }),
      });

      await processObservationEval({
        event: baseEvent,
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps,
      });

      expect(uploadScore).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          scoreId: mockScoreId,
          event: expect.objectContaining({
            body: expect.objectContaining({
              environment: "production",
            }),
          }),
        }),
      );
      expect(enqueueScoreIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          scoreId: mockScoreId,
        }),
      );
      expect(updateJobExecution).toHaveBeenCalledWith({
        id: jobExecutionId,
        projectId,
        data: expect.objectContaining({
          status: JobExecutionStatus.COMPLETED,
          jobOutputScoreId: mockScoreId,
          executionTraceId: mockEvalExecutionResult.executionTraceId,
        }),
      });
    });

    it("should call the code executor for code templates", async () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
        jobInputTraceId: "trace-abc",
        jobInputObservationId: "obs-xyz",
      });
      const template = createMockEvalTemplate({
        id: "template-456",
        projectId,
        type: EvalTemplateType.CODE,
        prompt: null,
        outputDefinition: null,
        sourceCode: "def evaluate(): pass",
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.PYTHON,
      });
      const config = createMockJobConfiguration({
        id: "config-123",
        projectId,
        evalTemplateId: "template-456",
        variableMapping: [
          { templateVariable: "output", selectedColumnId: "output" },
        ],
        evalTemplate: template,
      });
      const observation = createTestObservation({
        span_id: "obs-xyz",
        project_id: projectId,
        trace_id: "trace-abc",
        environment: "production",
        output: '{"response": "test output"}',
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(config);

      const deps = createMockProcessorDeps({
        downloadObservationFromS3: vi
          .fn()
          .mockResolvedValue(JSON.stringify(observation)),
      });

      await processObservationEval({
        event: baseEvent,
        executionType: EvalTemplateType.CODE,
        deps,
      });

      expect(executeCodeBasedEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          organizationId: "test-org-123",
          jobExecutionId,
          template: expect.objectContaining({
            id: "template-456",
            type: EvalTemplateType.CODE,
          }),
          extractedVariables: expect.arrayContaining([
            expect.objectContaining({
              var: "output",
              value: '{"response": "test output"}',
            }),
          ]),
        }),
      );
      expect(runLLMAsJudgeEvaluation).not.toHaveBeenCalled();
    });

    it("should use default environment for persisted scores when observation environment is null", async () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
      });
      const config = createMockJobConfiguration({
        id: "config-123",
        projectId,
        variableMapping: [],
      });
      const observation = createTestObservation({
        project_id: projectId,
        environment: undefined as unknown as string,
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(config);

      const uploadScore = vi
        .fn<EvalExecutionDeps["uploadScore"]>()
        .mockResolvedValue(undefined);
      const deps = createMockProcessorDeps({
        downloadObservationFromS3: vi
          .fn()
          .mockResolvedValue(JSON.stringify(observation)),
        evalExecutionDeps: createMockEvalExecutionDeps({
          uploadScore,
        }),
      });

      await processObservationEval({
        event: baseEvent,
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps,
      });

      expect(uploadScore).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            body: expect.objectContaining({
              environment: "default",
            }),
          }),
        }),
      );
    });

    it("should extract multiple variables from observation", async () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
      });
      const config = createMockJobConfiguration({
        id: "config-123",
        projectId,
        variableMapping: [
          { templateVariable: "input", selectedColumnId: "input" },
          { templateVariable: "output", selectedColumnId: "output" },
        ],
      });
      const observation = createTestObservation({
        project_id: projectId,
        input: '{"prompt": "Hello"}',
        output: '{"response": "World"}',
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(config);

      const deps = createMockProcessorDeps({
        downloadObservationFromS3: vi
          .fn()
          .mockResolvedValue(JSON.stringify(observation)),
      });

      await processObservationEval({
        event: baseEvent,
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps,
      });

      expect(runLLMAsJudgeEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          extractedVariables: expect.arrayContaining([
            expect.objectContaining({
              var: "input",
              value: '{"prompt": "Hello"}',
            }),
            expect.objectContaining({
              var: "output",
              value: '{"response": "World"}',
            }),
          ]),
        }),
      );
    });
  });

  describe("default dependencies", () => {
    it("should use default deps when none provided", async () => {
      // This test verifies the code path where deps are not provided
      // It will fail due to missing S3 config, but proves the default deps path is exercised
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
      });
      const config = createMockJobConfiguration({
        id: "config-123",
        projectId,
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(config);

      // Without injected deps, it will try to use real S3 which should fail
      await expect(
        processObservationEval({
          event: baseEvent,
          executionType: EvalTemplateType.LLM_AS_JUDGE,
        }),
      ).rejects.toThrow();
    });
  });
});
