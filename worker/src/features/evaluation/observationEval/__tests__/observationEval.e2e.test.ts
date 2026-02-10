import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { JobExecutionStatus, type Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { scheduleObservationEvals } from "../scheduleObservationEvals";
import { processObservationEval } from "../observationEvalProcessor";
import {
  createTestObservation,
  createTestEvalConfig,
  createFullyMockedEvalPipeline,
} from "./fixtures";
import { type ObservationForEval, EvalTargetObject } from "@langfuse/shared";

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
  },
}));

// Mock executeLLMAsJudgeEvaluation
vi.mock("../../evalService", () => ({
  executeLLMAsJudgeEvaluation: vi.fn(),
}));

// Mock logger
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
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
import { executeLLMAsJudgeEvaluation } from "../../evalService";

describe("Observation Eval E2E Pipeline", () => {
  const projectId = "test-project-123";

  beforeEach(() => {
    vi.clearAllMocks();
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
        .fn()
        .mockImplementation(async (params) => {
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
        prompt: "Evaluate the accuracy of: {{output}}",
        model: "gpt-4",
        provider: "openai",
        modelParams: {},
        outputSchema: {
          score: "A number between 0 and 1",
          reasoning: "Explanation",
        },
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
        deps: pipeline.processorDeps,
      });

      // ASSERT: Processing phase
      expect(
        pipeline.processorDeps.downloadObservationFromS3,
      ).toHaveBeenCalledWith(observationS3Path);
      expect(executeLLMAsJudgeEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          jobExecutionId: capturedJobExecutionId,
          extractedVariables: expect.arrayContaining([
            expect.objectContaining({
              var: "output",
              value: '{"response": "The capital of France is Paris."}',
            }),
          ]),
          environment: "production",
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
        .fn()
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
        prompt: "Q: {{question}} A: {{answer}}",
        model: "gpt-4",
        provider: "openai",
        modelParams: {},
        outputSchema: { score: "0-1", reasoning: "Why" },
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
      };

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(mockJob);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(mockConfig);

      await processObservationEval({
        event: {
          projectId,
          jobExecutionId: "job-123",
          observationS3Path: "test-path",
        },
        deps: pipeline.processorDeps,
      });

      expect(executeLLMAsJudgeEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          extractedVariables: expect.arrayContaining([
            expect.objectContaining({
              var: "question",
              value: '{"question": "What is 2+2?"}',
            }),
            expect.objectContaining({
              var: "answer",
              value: '{"answer": "4"}',
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
        prompt: "Compare {{generated}} to {{expected}}",
        model: "gpt-4",
        provider: "openai",
        modelParams: {},
        outputSchema: { score: "0-1", reasoning: "Why" },
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
      };

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(mockJob);
      (prisma.jobConfiguration.findFirst as Mock).mockResolvedValue(mockConfig);

      await processObservationEval({
        event: {
          projectId,
          jobExecutionId: "job-123",
          observationS3Path: "test-path",
        },
        deps: pipeline.processorDeps,
      });

      expect(executeLLMAsJudgeEvaluation).toHaveBeenCalledWith(
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
