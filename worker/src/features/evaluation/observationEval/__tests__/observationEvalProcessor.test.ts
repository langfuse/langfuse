import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { JobExecutionStatus } from "@prisma/client";
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
  });

  describe("job execution lookup", () => {
    it("should return early when job execution is not found", async () => {
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(null);

      const deps = createMockProcessorDeps();

      await processObservationEval({ event: baseEvent, deps });

      expect(prisma.jobExecution.findFirst).toHaveBeenCalledWith({
        where: {
          id: jobExecutionId,
          projectId,
        },
      });
      expect(deps.downloadObservationFromS3).not.toHaveBeenCalled();
      expect(executeLLMAsJudgeEvaluation).not.toHaveBeenCalled();
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
        processObservationEval({ event: baseEvent, deps }),
      ).rejects.toThrow(UnrecoverableError);
      await expect(
        processObservationEval({ event: baseEvent, deps }),
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
        processObservationEval({ event: baseEvent, deps }),
      ).rejects.toThrow(UnrecoverableError);
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

      const deps: ObservationEvalProcessorDeps = {
        downloadObservationFromS3: vi
          .fn()
          .mockRejectedValue(new Error("S3 connection failed")),
      };

      // S3 connection errors should be retryable (not UnrecoverableError)
      await expect(
        processObservationEval({ event: baseEvent, deps }),
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

      const deps: ObservationEvalProcessorDeps = {
        downloadObservationFromS3: vi
          .fn()
          .mockResolvedValue("not valid json {"),
      };

      // Invalid JSON is a permanent error - should be UnrecoverableError
      await expect(
        processObservationEval({ event: baseEvent, deps }),
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
      const deps: ObservationEvalProcessorDeps = {
        downloadObservationFromS3: vi
          .fn()
          .mockResolvedValue(JSON.stringify(invalidObservation)),
      };

      // Schema validation failures are permanent - should be UnrecoverableError
      await expect(
        processObservationEval({ event: baseEvent, deps }),
      ).rejects.toThrow(UnrecoverableError);
    });
  });

  describe("successful execution", () => {
    it("should call executeLLMAsJudgeEvaluation with correct parameters", async () => {
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

      const deps = createMockProcessorDeps({
        downloadObservationFromS3: vi
          .fn()
          .mockResolvedValue(JSON.stringify(observation)),
      });

      await processObservationEval({ event: baseEvent, deps });

      expect(executeLLMAsJudgeEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
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
          environment: "production",
        }),
      );
    });

    it("should use default environment when observation environment is null", async () => {
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

      const deps = createMockProcessorDeps({
        downloadObservationFromS3: vi
          .fn()
          .mockResolvedValue(JSON.stringify(observation)),
      });

      await processObservationEval({ event: baseEvent, deps });

      expect(executeLLMAsJudgeEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: "default",
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

      await processObservationEval({ event: baseEvent, deps });

      expect(executeLLMAsJudgeEvaluation).toHaveBeenCalledWith(
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
        processObservationEval({ event: baseEvent }),
      ).rejects.toThrow();
    });
  });
});
