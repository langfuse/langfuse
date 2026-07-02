import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
  JobExecutionStatus,
  type Prisma,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { scheduleObservationEvals } from "../scheduleObservationEvals";
import { processObservationEval } from "../observationEvalProcessor";
import { type ObservationEvalSchedulerDeps } from "../types";
import {
  createTestObservation,
  createTestEvalConfig,
  createFullyMockedEvalPipeline,
  createMockEvalTemplate,
  createMockJobConfiguration,
  createMockJobExecution,
} from "./fixtures";
import {
  EvalTargetObject,
  type ObservationVariableMapping,
} from "@langfuse/shared";

const mocks = vi.hoisted(() => ({
  writeInternalTrace: vi.fn(),
}));

// Mock prisma for processObservationEval
vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    jobExecution: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    jobConfiguration: {
      findFirst: vi.fn(),
    },
    datasetItem: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock runLLMAsJudgeEvaluation
vi.mock("../../evalService", () => ({
  runLLMAsJudgeEvaluation: vi.fn(),
}));

vi.mock("../../../internal-tracing/createInternalEventsWriter", () => ({
  createInternalEventsWriter: () => ({ write: mocks.writeInternalTrace }),
}));

// Mock logger
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual<
    typeof import("@langfuse/shared/src/server")
  >("@langfuse/shared/src/server");
  return {
    ...actual,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    DEFAULT_TRACE_ENVIRONMENT: "default",
    resolveConfiguredCodeEvalDispatcher: vi.fn(
      () => new actual.LocalCodeEvalDispatcher(),
    ),
  };
});

import { prisma } from "@langfuse/shared/src/db";
import { runLLMAsJudgeEvaluation } from "../../evalService";

const mockEvalExecutionResult = {
  scores: [
    {
      dataType: "NUMERIC" as const,
      value: 0.85,
      name: "test-score",
      comment: "Good response",
    },
  ],
  executionTraceId: "trace-123",
  metadata: {},
};

describe("Observation Eval E2E Pipeline", () => {
  const projectId = "test-project-123";

  beforeEach(() => {
    vi.clearAllMocks();
    (runLLMAsJudgeEvaluation as Mock).mockResolvedValue(
      mockEvalExecutionResult,
    );
  });

  describe("full pipeline: schedule → process → execute", () => {
    it("should schedule and process observation through full eval pipeline", async () => {
      // ARRANGE: Create observation and config
      const observation = createTestObservation({
        span_id: `obs-${randomUUID()}`,
        trace_id: `trace-${randomUUID()}`,
        project_id: projectId,
        type: "generation",
        provided_model_name: "gpt-4",
        environment: "production",
        output: '{"response": "The capital of France is Paris."}',
      });

      const config = createTestEvalConfig({
        id: `config-${randomUUID()}`,
        projectId,
        filter: [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["generation"],
          },
        ],
        variableMapping: [
          { templateVariable: "output", selectedColumnId: "output" },
        ],
        scoreName: "accuracy",
      });

      // Create mocked pipeline
      const pipeline = createFullyMockedEvalPipeline({
        observation,
        llmResponse: {
          score: 0.95,
          reasoning: "Accurate geographic information",
        },
      });

      // Track job execution ID
      let capturedJobExecutionId: string | undefined;
      const mockCreateJobExecution = vi
        .fn<ObservationEvalSchedulerDeps["upsertJobExecution"]>()
        .mockImplementation(async () => {
          capturedJobExecutionId = `job-exec-${randomUUID()}`;
          return { id: capturedJobExecutionId };
        });
      pipeline.schedulerDeps.upsertJobExecution = mockCreateJobExecution;

      // ACT: Schedule the observation eval
      await scheduleObservationEvals({
        observation,
        configs: [config],
        schedulerDeps: pipeline.schedulerDeps,
      });

      // ASSERT: Scheduling phase
      expect(pipeline.schedulerDeps.uploadObservationToS3).toHaveBeenCalledWith(
        {
          projectId,
          traceId: observation.trace_id,
          observationId: observation.span_id,
          data: observation,
        },
      );
      expect(mockCreateJobExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          jobConfigurationId: config.id,
          jobInputTraceId: observation.trace_id,
          jobInputObservationId: observation.span_id,
          status: JobExecutionStatus.PENDING,
        }),
      );
      expect(pipeline.schedulerDeps.enqueueEvalJob).toHaveBeenCalled();

      // Get the S3 path that was used
      const uploadCall = (pipeline.schedulerDeps.uploadObservationToS3 as Mock)
        .mock.results[0];
      const observationS3Path = await uploadCall.value;

      // ARRANGE: Set up mocks for processing phase
      const mockJob = {
        id: capturedJobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: config.id,
        jobInputTraceId: observation.trace_id,
        jobInputObservationId: observation.span_id,
        createdAt: new Date(),
        updatedAt: new Date(),
        startTime: new Date(),
        endTime: null,
        error: null,
        jobOutputScoreId: null,
        executionTraceId: null,
        jobTemplateId: null,
        jobInputDatasetItemId: null,
        jobInputTraceTimestamp: null,
      };

      const mockTemplate = {
        id: config.evalTemplateId,
        projectId,
        name: "Accuracy Evaluator",
        version: 1,
        type: EvalTemplateType.LLM_AS_JUDGE,
        prompt: "Evaluate the accuracy of: {{output}}",
        model: "gpt-4",
        provider: "openai",
        modelParams: {},
        outputDefinition: {
          score: "A number between 0 and 1",
          reasoning: "Explanation",
        },
        sourceCode: null,
        sourceCodeLanguage: null,
        vars: ["output"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockConfig = {
        id: config.id,
        projectId,
        jobType: "EVAL",
        evalTemplateId: config.evalTemplateId,
        scoreName: config.scoreName,
        targetObject: EvalTargetObject.EVENT,
        filter: config.filter,
        variableMapping: config.variableMapping,
        sampling: "1.0",
        delay: 0,
        status: "ACTIVE",
        timeScope: ["NEW"],
        createdAt: new Date(),
        updatedAt: new Date(),
        evalTemplate: mockTemplate,
        project: { orgId: "test-org-123" },
      };

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(mockJob);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(mockConfig);

      // ACT: Process the observation eval job
      await processObservationEval({
        event: {
          projectId,
          jobExecutionId: capturedJobExecutionId!,
          observationS3Path,
        },
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps: pipeline.processorDeps,
      });

      // ASSERT: Processing phase
      expect(
        pipeline.processorDeps.downloadObservationFromS3,
      ).toHaveBeenCalledWith(observationS3Path);
      expect(runLLMAsJudgeEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          organizationId: "test-org-123",
          jobExecutionId: capturedJobExecutionId,
          extractedVariables: expect.arrayContaining([
            expect.objectContaining({
              var: "output",
              value: { response: "The capital of France is Paris." },
            }),
          ]),
          environment: "production",
        }),
      );
    });

    it("should process a code-based eval through execution and score persistence", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        input: { question: "2+2" },
        output: JSON.stringify({
          evaluation: {
            result: {
              final: {
                answer: "4",
                numericString: "42",
              },
            },
          },
        }),
        metadata: { rubric: "math" },
        experiment_id: "experiment-123",
        experiment_item_expected_output: "4",
        environment: "production",
      });
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "input", selectedColumnId: "input" },
        { templateVariable: "output", selectedColumnId: "output" },
        {
          templateVariable: "metadata",
          selectedColumnId: "metadata",
        },
        {
          templateVariable: "experimentItemExpectedOutput",
          selectedColumnId: "experimentItemExpectedOutput",
        },
      ];
      const config = createTestEvalConfig({
        id: `config-${randomUUID()}`,
        projectId,
        scoreName: "code-score",
        variableMapping,
      });
      const pipeline = createFullyMockedEvalPipeline({ observation });
      const job = createMockJobExecution({
        id: `job-exec-${randomUUID()}`,
        projectId,
        jobConfigurationId: config.id,
        jobInputTraceId: observation.trace_id,
        jobInputObservationId: observation.span_id,
      });
      const template = createMockEvalTemplate({
        id: config.evalTemplateId,
        projectId,
        name: "Code nested context evaluator",
        type: EvalTemplateType.CODE,
        prompt: null,
        outputDefinition: null,
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        sourceCode: `
          function evaluate(ctx) {
            const matched =
              ctx.observation.input.question === "2+2" &&
              ctx.observation.output.evaluation.result.final.answer ===
                ctx.experiment?.itemExpectedOutput &&
              ctx.observation.output.evaluation.result.final.numericString === "42" &&
              ctx.observation.metadata.rubric === "math";

            return {
              scores: [
                {
                  name: "nested-context-score",
                  value: matched ? 1 : 0,
                  dataType: "BOOLEAN",
                  comment: ctx.experiment?.itemExpectedOutput,
                },
              ],
            };
          }
        `,
      });
      const mockConfig = createMockJobConfiguration({
        id: config.id,
        projectId,
        evalTemplateId: config.evalTemplateId,
        scoreName: config.scoreName,
        variableMapping,
        evalTemplate: template,
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(mockConfig);

      await processObservationEval({
        event: {
          projectId,
          jobExecutionId: job.id,
          observationS3Path: "test-path",
        },
        executionType: EvalTemplateType.CODE,
        deps: pipeline.processorDeps,
      });

      expect(
        pipeline.processorDeps.downloadObservationFromS3,
      ).toHaveBeenCalledWith("test-path");
      expect(pipeline.executionDeps.uploadScore).toHaveBeenCalledTimes(1);
      expect(
        pipeline.executionDeps.enqueueScoreIngestion,
      ).toHaveBeenCalledTimes(1);
      expect(pipeline.executionDeps.updateJobExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          id: job.id,
          projectId,
          data: expect.objectContaining({
            status: JobExecutionStatus.COMPLETED,
            executionTraceId: expect.any(String),
            jobOutputScoreId: expect.any(String),
          }),
        }),
      );
      expect(pipeline.executionDeps.uploadScore).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          event: expect.objectContaining({
            body: expect.objectContaining({
              traceId: observation.trace_id,
              observationId: observation.span_id,
              name: "nested-context-score",
              value: 1,
              dataType: "BOOLEAN",
              comment: "4",
              environment: "production",
              source: "EVAL",
            }),
          }),
        }),
      );
      expect(mocks.writeInternalTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          eventInputs: [
            expect.objectContaining({
              input: expect.stringContaining('"observation"'),
              output: expect.stringContaining('"nested-context-score"'),
            }),
          ],
        }),
      );
    });

    it("should not schedule eval when filter does not match", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        type: "span", // Not a generation
      });

      const config = createTestEvalConfig({
        projectId,
        filter: [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["generation"], // Only matches generations
          },
        ],
      });

      const pipeline = createFullyMockedEvalPipeline({ observation });

      await scheduleObservationEvals({
        observation,
        configs: [config],
        schedulerDeps: pipeline.schedulerDeps,
      });

      // S3 upload only happens if there are matching configs
      expect(
        pipeline.schedulerDeps.uploadObservationToS3,
      ).not.toHaveBeenCalled();
      expect(pipeline.schedulerDeps.upsertJobExecution).not.toHaveBeenCalled();
      expect(pipeline.schedulerDeps.enqueueEvalJob).not.toHaveBeenCalled();
    });

    it("should not schedule eval when sampled out", async () => {
      const observation = createTestObservation({ project_id: projectId });

      const config = createTestEvalConfig({
        projectId,
        filter: [], // Match all
        sampling: { toNumber: () => 0 } as unknown as Prisma.Decimal, // 0% sampling
      });

      const pipeline = createFullyMockedEvalPipeline({ observation });

      await scheduleObservationEvals({
        observation,
        configs: [config],
        schedulerDeps: pipeline.schedulerDeps,
      });

      expect(pipeline.schedulerDeps.upsertJobExecution).not.toHaveBeenCalled();
    });

    it("should schedule multiple evals for multiple matching configs", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        type: "generation",
        provided_model_name: "gpt-4",
        trace_name: "llm-trace",
      });

      const config1 = createTestEvalConfig({
        id: "config-1",
        projectId,
        scoreName: "accuracy",
        filter: [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["generation"],
          },
        ],
      });

      const config2 = createTestEvalConfig({
        id: "config-2",
        projectId,
        scoreName: "relevance",
        filter: [
          {
            column: "traceName",
            type: "stringOptions",
            operator: "any of",
            value: ["llm-trace"],
          },
        ],
      });

      const config3 = createTestEvalConfig({
        id: "config-3",
        projectId,
        scoreName: "safety",
        filter: [], // Match all
      });

      const pipeline = createFullyMockedEvalPipeline({ observation });
      pipeline.schedulerDeps.upsertJobExecution = vi
        .fn<ObservationEvalSchedulerDeps["upsertJobExecution"]>()
        .mockResolvedValueOnce({ id: "job-1" })
        .mockResolvedValueOnce({ id: "job-2" })
        .mockResolvedValueOnce({ id: "job-3" });

      await scheduleObservationEvals({
        observation,
        configs: [config1, config2, config3],
        schedulerDeps: pipeline.schedulerDeps,
      });

      // All three configs should match
      expect(pipeline.schedulerDeps.upsertJobExecution).toHaveBeenCalledTimes(
        3,
      );
      expect(pipeline.schedulerDeps.enqueueEvalJob).toHaveBeenCalledTimes(3);

      // S3 upload should only happen once
      expect(
        pipeline.schedulerDeps.uploadObservationToS3,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe("variable extraction scenarios", () => {
    it("should extract input and output for comparison evals", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        input: '{"question": "What is 2+2?"}',
        output: '{"answer": "4"}',
      });

      const config = createTestEvalConfig({
        projectId,
        variableMapping: [
          { templateVariable: "question", selectedColumnId: "input" },
          { templateVariable: "answer", selectedColumnId: "output" },
        ],
      });

      const pipeline = createFullyMockedEvalPipeline({ observation });

      // Set up mocks for processing
      const mockJob = {
        id: "job-123",
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: config.id,
        jobInputTraceId: observation.trace_id,
        jobInputObservationId: observation.span_id,
        createdAt: new Date(),
        updatedAt: new Date(),
        startTime: null,
        endTime: null,
        error: null,
        jobOutputScoreId: null,
        executionTraceId: null,
        jobTemplateId: null,
        jobInputDatasetItemId: null,
        jobInputTraceTimestamp: null,
      };

      const mockTemplate = {
        id: config.evalTemplateId,
        projectId,
        name: "Test Eval",
        version: 1,
        type: EvalTemplateType.LLM_AS_JUDGE,
        prompt: "Q: {{question}} A: {{answer}}",
        model: "gpt-4",
        provider: "openai",
        modelParams: {},
        outputDefinition: { score: "0-1", reasoning: "Why" },
        sourceCode: null,
        sourceCodeLanguage: null,
        vars: ["question", "answer"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockConfig = {
        id: config.id,
        projectId,
        jobType: "EVAL",
        evalTemplateId: config.evalTemplateId,
        scoreName: config.scoreName,
        targetObject: EvalTargetObject.EVENT,
        filter: [],
        variableMapping: config.variableMapping,
        sampling: "1.0",
        delay: 0,
        status: "ACTIVE",
        timeScope: ["NEW"],
        createdAt: new Date(),
        updatedAt: new Date(),
        evalTemplate: mockTemplate,
        project: { orgId: "test-org-123" },
      };

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(mockJob);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(mockConfig);

      await processObservationEval({
        event: {
          projectId,
          jobExecutionId: "job-123",
          observationS3Path: "test-path",
        },
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps: pipeline.processorDeps,
      });

      expect(runLLMAsJudgeEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          extractedVariables: expect.arrayContaining([
            expect.objectContaining({
              var: "question",
              value: { question: "What is 2+2?" },
            }),
            expect.objectContaining({
              var: "answer",
              value: { answer: "4" },
            }),
          ]),
        }),
      );
    });

    it("should extract expected output for experiment evals", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        output: '{"generated": "Paris"}',
        experiment_item_expected_output: "Paris",
      });

      const config = createTestEvalConfig({
        projectId,
        variableMapping: [
          { templateVariable: "generated", selectedColumnId: "output" },
          {
            templateVariable: "expected",
            selectedColumnId: "experimentItemExpectedOutput",
          },
        ],
      });

      const pipeline = createFullyMockedEvalPipeline({ observation });

      const mockJob = {
        id: "job-123",
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: config.id,
        jobInputTraceId: observation.trace_id,
        jobInputObservationId: observation.span_id,
        createdAt: new Date(),
        updatedAt: new Date(),
        startTime: null,
        endTime: null,
        error: null,
        jobOutputScoreId: null,
        executionTraceId: null,
        jobTemplateId: null,
        jobInputDatasetItemId: null,
        jobInputTraceTimestamp: null,
      };

      const mockTemplate = {
        id: config.evalTemplateId,
        projectId,
        name: "Test Eval",
        version: 1,
        type: EvalTemplateType.LLM_AS_JUDGE,
        prompt: "Compare {{generated}} to {{expected}}",
        model: "gpt-4",
        provider: "openai",
        modelParams: {},
        outputDefinition: { score: "0-1", reasoning: "Why" },
        sourceCode: null,
        sourceCodeLanguage: null,
        vars: ["generated", "expected"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockConfig = {
        id: config.id,
        projectId,
        jobType: "EVAL",
        evalTemplateId: config.evalTemplateId,
        scoreName: config.scoreName,
        targetObject: EvalTargetObject.EVENT,
        filter: [],
        variableMapping: config.variableMapping,
        sampling: "1.0",
        delay: 0,
        status: "ACTIVE",
        timeScope: ["NEW"],
        createdAt: new Date(),
        updatedAt: new Date(),
        evalTemplate: mockTemplate,
        project: { orgId: "test-org-123" },
      };

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(mockJob);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(mockConfig);

      await processObservationEval({
        event: {
          projectId,
          jobExecutionId: "job-123",
          observationS3Path: "test-path",
        },
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps: pipeline.processorDeps,
      });

      expect(runLLMAsJudgeEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          extractedVariables: expect.arrayContaining([
            expect.objectContaining({
              var: "expected",
              value: "Paris",
            }),
          ]),
        }),
      );
    });
  });

  describe("filter scenarios", () => {
    it("should filter by environment", async () => {
      const prodObservation = createTestObservation({
        project_id: projectId,
        environment: "production",
      });

      const stagingObservation = createTestObservation({
        project_id: projectId,
        environment: "staging",
      });

      const config = createTestEvalConfig({
        projectId,
        filter: [
          {
            column: "environment",
            type: "stringOptions",
            operator: "any of",
            value: ["production"],
          },
        ],
      });

      const pipeline1 = createFullyMockedEvalPipeline({
        observation: prodObservation,
      });
      const pipeline2 = createFullyMockedEvalPipeline({
        observation: stagingObservation,
      });

      await scheduleObservationEvals({
        observation: prodObservation,
        configs: [config],
        schedulerDeps: pipeline1.schedulerDeps,
      });

      await scheduleObservationEvals({
        observation: stagingObservation,
        configs: [config],
        schedulerDeps: pipeline2.schedulerDeps,
      });

      // Production should match
      expect(pipeline1.schedulerDeps.upsertJobExecution).toHaveBeenCalled();
      // Staging should not match
      expect(pipeline2.schedulerDeps.upsertJobExecution).not.toHaveBeenCalled();
    });

    it("should filter by tags", async () => {
      const taggedObservation = createTestObservation({
        project_id: projectId,
        tags: ["important", "test"],
      });

      const untaggedObservation = createTestObservation({
        project_id: projectId,
        tags: ["other"],
      });

      const config = createTestEvalConfig({
        projectId,
        filter: [
          {
            column: "tags",
            type: "arrayOptions",
            operator: "any of",
            value: ["important"],
          },
        ],
      });

      const pipeline1 = createFullyMockedEvalPipeline({
        observation: taggedObservation,
      });
      const pipeline2 = createFullyMockedEvalPipeline({
        observation: untaggedObservation,
      });

      await scheduleObservationEvals({
        observation: taggedObservation,
        configs: [config],
        schedulerDeps: pipeline1.schedulerDeps,
      });

      await scheduleObservationEvals({
        observation: untaggedObservation,
        configs: [config],
        schedulerDeps: pipeline2.schedulerDeps,
      });

      expect(pipeline1.schedulerDeps.upsertJobExecution).toHaveBeenCalled();
      expect(pipeline2.schedulerDeps.upsertJobExecution).not.toHaveBeenCalled();
    });
  });
});
