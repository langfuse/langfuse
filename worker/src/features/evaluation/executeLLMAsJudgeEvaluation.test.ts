import { describe, expect, it, vi } from "vitest";
import { JobExecutionStatus } from "@prisma/client";
import { executeLLMAsJudgeEvaluation } from "./evalService";
import { createMockEvalExecutionDeps } from "./evalExecutionDeps";
import { UnrecoverableError } from "../../errors/UnrecoverableError";
import { ExtractedVariable } from "./observationEval/extractObservationVariables";

/**
 * Unit tests for executeLLMAsJudgeEvaluation with mocked dependencies.
 *
 * These tests verify the orchestration logic without hitting real databases,
 * LLMs, or external services. Each test creates mock deps with specific
 * overrides to test different scenarios.
 *
 * Note: Job fetching, config fetching, template fetching, and cancelled job
 * handling are now the responsibility of callers (evaluate() and
 * processObservationEval()), not this function. Tests for those scenarios
 * have been removed.
 */
describe("executeLLMAsJudgeEvaluation", () => {
  const projectId = "test-project-123";
  const jobExecutionId = "test-job-execution-456";

  const mockJobExecution = {
    id: jobExecutionId,
    createdAt: new Date(),
    updatedAt: new Date(),
    projectId,
    status: JobExecutionStatus.PENDING,
    startTime: new Date(),
    endTime: null,
    jobConfigurationId: "config-789",
    jobInputTraceId: "trace-abc",
    jobInputTraceTimestamp: new Date(),
    jobInputObservationId: null,
    jobInputDatasetItemId: null,
    jobTemplateId: "template-xyz",
    error: null,
    jobOutputScoreId: null,
    executionTraceId: null,
  };

  const mockJobConfiguration = {
    id: "config-789",
    createdAt: new Date(),
    updatedAt: new Date(),
    projectId,
    jobType: "EVAL" as const,
    evalTemplateId: "template-xyz",
    scoreName: "accuracy",
    targetObject: "trace",
    filter: [],
    variableMapping: [],
    sampling: "1.0",
    delay: 0,
    status: "ACTIVE" as const,
    timeScope: ["NEW" as const],
    filterTarget: "trace",
  };

  const mockEvalTemplate = {
    id: "template-xyz",
    createdAt: new Date(),
    updatedAt: new Date(),
    name: "Accuracy Evaluator",
    version: 1,
    prompt: "Evaluate accuracy of {{output}}",
    model: "gpt-4",
    provider: "openai",
    modelParams: {},
    outputSchema: {
      score: "A number between 0 and 1",
      reasoning: "Explain your reasoning",
    },
    vars: ["output"],
    projectId,
  };

  const extractedVariables: ExtractedVariable[] = [
    {
      var: "output",
      value: "The model response text",
      environment: "production",
    },
  ];

  describe("successful execution", () => {
    it("should complete evaluation successfully", async () => {
      const updateJobExecution = vi.fn();
      const uploadScore = vi.fn();
      const enqueueScoreIngestion = vi.fn();
      const callLLM = vi.fn().mockResolvedValue({
        score: 0.85,
        reasoning: "High accuracy observed",
      });

      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: vi.fn().mockResolvedValue({
          valid: true,
          config: {
            provider: "openai",
            model: "gpt-4",
            apiKey: { adapter: "openai", secretKey: "test-key" },
            modelParams: {},
          },
        }),
        callLLM,
        uploadScore,
        enqueueScoreIngestion,
        updateJobExecution,
      });

      await executeLLMAsJudgeEvaluation({
        projectId,
        jobExecutionId,
        job: mockJobExecution,
        config: mockJobConfiguration,
        template: mockEvalTemplate,
        extractedVariables,
        environment: "production",
        deps,
      });

      // Verify LLM was called
      expect(callLLM).toHaveBeenCalledTimes(1);

      // Verify score was uploaded
      expect(uploadScore).toHaveBeenCalledTimes(1);
      expect(uploadScore).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          event: expect.objectContaining({
            body: expect.objectContaining({
              name: "accuracy",
              value: 0.85,
              comment: "High accuracy observed",
            }),
          }),
        }),
      );

      // Verify score ingestion was enqueued
      expect(enqueueScoreIngestion).toHaveBeenCalledTimes(1);

      // Verify job execution was updated to completed
      expect(updateJobExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          id: jobExecutionId,
          projectId,
          data: expect.objectContaining({
            status: JobExecutionStatus.COMPLETED,
            endTime: expect.any(Date),
            jobOutputScoreId: expect.any(String),
            executionTraceId: expect.any(String),
          }),
        }),
      );
    });

    it("should include observation ID in score when present", async () => {
      const jobWithObservation = {
        ...mockJobExecution,
        jobInputObservationId: "obs-123",
      };

      const uploadScore = vi.fn();
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: vi.fn().mockResolvedValue({
          valid: true,
          config: {
            provider: "openai",
            model: "gpt-4",
            apiKey: { adapter: "openai", secretKey: "test-key" },
            modelParams: {},
          },
        }),
        callLLM: vi.fn().mockResolvedValue({
          score: 0.9,
          reasoning: "Excellent",
        }),
        uploadScore,
        enqueueScoreIngestion: vi.fn(),
        updateJobExecution: vi.fn(),
      });

      await executeLLMAsJudgeEvaluation({
        projectId,
        jobExecutionId,
        job: jobWithObservation,
        config: mockJobConfiguration,
        template: mockEvalTemplate,
        extractedVariables,
        environment: "production",
        deps,
      });

      expect(uploadScore).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            body: expect.objectContaining({
              observationId: "obs-123",
            }),
          }),
        }),
      );
    });

    it("should use provided environment", async () => {
      const uploadScore = vi.fn();
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: vi.fn().mockResolvedValue({
          valid: true,
          config: {
            provider: "openai",
            model: "gpt-4",
            apiKey: { adapter: "openai", secretKey: "test-key" },
            modelParams: {},
          },
        }),
        callLLM: vi.fn().mockResolvedValue({
          score: 0.7,
          reasoning: "Good",
        }),
        uploadScore,
        enqueueScoreIngestion: vi.fn(),
        updateJobExecution: vi.fn(),
      });

      await executeLLMAsJudgeEvaluation({
        projectId,
        jobExecutionId,
        job: mockJobExecution,
        config: mockJobConfiguration,
        template: mockEvalTemplate,
        extractedVariables: [{ var: "output", value: "test" }],
        environment: "staging",
        deps,
      });

      expect(uploadScore).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            body: expect.objectContaining({
              environment: "staging",
            }),
          }),
        }),
      );
    });

    it("should use 'default' environment when explicitly passed", async () => {
      const uploadScore = vi.fn();
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: vi.fn().mockResolvedValue({
          valid: true,
          config: {
            provider: "openai",
            model: "gpt-4",
            apiKey: { adapter: "openai", secretKey: "test-key" },
            modelParams: {},
          },
        }),
        callLLM: vi.fn().mockResolvedValue({
          score: 0.5,
          reasoning: "Average",
        }),
        uploadScore,
        enqueueScoreIngestion: vi.fn(),
        updateJobExecution: vi.fn(),
      });

      await executeLLMAsJudgeEvaluation({
        projectId,
        jobExecutionId,
        job: mockJobExecution,
        config: mockJobConfiguration,
        template: mockEvalTemplate,
        extractedVariables: [{ var: "output", value: "test" }],
        environment: "default",
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
  });

  describe("configuration errors", () => {
    it("should throw UnrecoverableError if model config invalid", async () => {
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: vi.fn().mockResolvedValue({
          valid: false,
          error: "No API key configured",
        }),
      });

      await expect(
        executeLLMAsJudgeEvaluation({
          projectId,
          jobExecutionId,
          job: mockJobExecution,
          config: mockJobConfiguration,
          template: mockEvalTemplate,
          extractedVariables,
          environment: "production",
          deps,
        }),
      ).rejects.toThrow(UnrecoverableError);
    });

    it("should throw UnrecoverableError if output schema invalid", async () => {
      const templateWithBadSchema = {
        ...mockEvalTemplate,
        outputSchema: { invalidKey: "value" }, // missing score and reasoning
      };

      const deps = createMockEvalExecutionDeps({});

      await expect(
        executeLLMAsJudgeEvaluation({
          projectId,
          jobExecutionId,
          job: mockJobExecution,
          config: mockJobConfiguration,
          template: templateWithBadSchema,
          extractedVariables,
          environment: "production",
          deps,
        }),
      ).rejects.toThrow(UnrecoverableError);
    });
  });

  describe("LLM response errors", () => {
    it("should throw UnrecoverableError for invalid LLM response", async () => {
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: vi.fn().mockResolvedValue({
          valid: true,
          config: {
            provider: "openai",
            model: "gpt-4",
            apiKey: { adapter: "openai", secretKey: "test-key" },
            modelParams: {},
          },
        }),
        callLLM: vi.fn().mockResolvedValue({
          // Invalid response - score is string instead of number
          score: "high",
          reasoning: "Good response",
        }),
      });

      await expect(
        executeLLMAsJudgeEvaluation({
          projectId,
          jobExecutionId,
          job: mockJobExecution,
          config: mockJobConfiguration,
          template: mockEvalTemplate,
          extractedVariables,
          environment: "production",
          deps,
        }),
      ).rejects.toThrow(UnrecoverableError);
    });

    it("should throw UnrecoverableError for missing LLM response fields", async () => {
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: vi.fn().mockResolvedValue({
          valid: true,
          config: {
            provider: "openai",
            model: "gpt-4",
            apiKey: { adapter: "openai", secretKey: "test-key" },
            modelParams: {},
          },
        }),
        callLLM: vi.fn().mockResolvedValue({
          // Missing reasoning field
          score: 0.8,
        }),
      });

      await expect(
        executeLLMAsJudgeEvaluation({
          projectId,
          jobExecutionId,
          job: mockJobExecution,
          config: mockJobConfiguration,
          template: mockEvalTemplate,
          extractedVariables,
          environment: "production",
          deps,
        }),
      ).rejects.toThrow(UnrecoverableError);
    });
  });

  describe("score persistence errors", () => {
    it("should throw error if score upload fails", async () => {
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: vi.fn().mockResolvedValue({
          valid: true,
          config: {
            provider: "openai",
            model: "gpt-4",
            apiKey: { adapter: "openai", secretKey: "test-key" },
            modelParams: {},
          },
        }),
        callLLM: vi.fn().mockResolvedValue({
          score: 0.8,
          reasoning: "Good",
        }),
        uploadScore: vi.fn().mockRejectedValue(new Error("S3 upload failed")),
      });

      await expect(
        executeLLMAsJudgeEvaluation({
          projectId,
          jobExecutionId,
          job: mockJobExecution,
          config: mockJobConfiguration,
          template: mockEvalTemplate,
          extractedVariables,
          environment: "production",
          deps,
        }),
      ).rejects.toThrow("Failed to write score");
    });

    it("should throw error if score ingestion queue fails", async () => {
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: vi.fn().mockResolvedValue({
          valid: true,
          config: {
            provider: "openai",
            model: "gpt-4",
            apiKey: { adapter: "openai", secretKey: "test-key" },
            modelParams: {},
          },
        }),
        callLLM: vi.fn().mockResolvedValue({
          score: 0.8,
          reasoning: "Good",
        }),
        uploadScore: vi.fn(),
        enqueueScoreIngestion: vi
          .fn()
          .mockRejectedValue(new Error("Queue unavailable")),
      });

      await expect(
        executeLLMAsJudgeEvaluation({
          projectId,
          jobExecutionId,
          job: mockJobExecution,
          config: mockJobConfiguration,
          template: mockEvalTemplate,
          extractedVariables,
          environment: "production",
          deps,
        }),
      ).rejects.toThrow("Failed to write score");
    });
  });

  describe("prompt compilation", () => {
    it("should handle prompt compilation errors gracefully", async () => {
      // Template with invalid syntax - the function should fall back to raw template
      const templateWithBadPrompt = {
        ...mockEvalTemplate,
        prompt: "Evaluate {{unclosed_bracket",
      };

      const uploadScore = vi.fn();
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: vi.fn().mockResolvedValue({
          valid: true,
          config: {
            provider: "openai",
            model: "gpt-4",
            apiKey: { adapter: "openai", secretKey: "test-key" },
            modelParams: {},
          },
        }),
        callLLM: vi.fn().mockResolvedValue({
          score: 0.5,
          reasoning: "Could not parse properly",
        }),
        uploadScore,
        enqueueScoreIngestion: vi.fn(),
        updateJobExecution: vi.fn(),
      });

      // Should not throw - falls back to raw template
      await executeLLMAsJudgeEvaluation({
        projectId,
        jobExecutionId,
        job: mockJobExecution,
        config: mockJobConfiguration,
        template: templateWithBadPrompt,
        extractedVariables,
        environment: "production",
        deps,
      });

      // Should still complete (with fallback prompt)
      expect(uploadScore).toHaveBeenCalled();
    });
  });
});
