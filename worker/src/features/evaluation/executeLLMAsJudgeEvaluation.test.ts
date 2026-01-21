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

    it("should compile multiple variables into prompt", async () => {
      const multiVarTemplate = {
        ...mockEvalTemplate,
        prompt: "Compare input: {{input}} with output: {{output}}",
        vars: ["input", "output"],
      };

      const multiVariables: ExtractedVariable[] = [
        { var: "input", value: "What is 2+2?" },
        { var: "output", value: "The answer is 4" },
      ];

      const callLLM = vi.fn().mockResolvedValue({
        score: 1.0,
        reasoning: "Perfect match",
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
        uploadScore: vi.fn(),
        enqueueScoreIngestion: vi.fn(),
        updateJobExecution: vi.fn(),
      });

      await executeLLMAsJudgeEvaluation({
        projectId,
        jobExecutionId,
        job: mockJobExecution,
        config: mockJobConfiguration,
        template: multiVarTemplate,
        extractedVariables: multiVariables,
        environment: "production",
        deps,
      });

      // Verify the compiled prompt contains both variables
      expect(callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content:
                "Compare input: What is 2+2? with output: The answer is 4",
            }),
          ]),
        }),
      );
    });
  });

  describe("LLM call parameters", () => {
    it("should pass correct traceSinkParams to LLM for observability", async () => {
      const callLLM = vi.fn().mockResolvedValue({
        score: 0.8,
        reasoning: "Good response",
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
        uploadScore: vi.fn(),
        enqueueScoreIngestion: vi.fn(),
        updateJobExecution: vi.fn(),
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

      expect(callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          traceSinkParams: expect.objectContaining({
            targetProjectId: projectId,
            traceId: expect.any(String), // executionTraceId
            traceName: `Execute evaluator: ${mockEvalTemplate.name}`,
            environment: "langfuse-llm-as-a-judge",
            metadata: expect.objectContaining({
              job_execution_id: jobExecutionId,
              job_configuration_id: mockJobExecution.jobConfigurationId,
              target_trace_id: mockJobExecution.jobInputTraceId,
              score_id: expect.any(String),
            }),
          }),
        }),
      );
    });

    it("should pass structured output schema to LLM", async () => {
      const callLLM = vi.fn().mockResolvedValue({
        score: 0.8,
        reasoning: "Good response",
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
        uploadScore: vi.fn(),
        enqueueScoreIngestion: vi.fn(),
        updateJobExecution: vi.fn(),
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

      expect(callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          structuredOutputSchema: expect.objectContaining({
            shape: expect.objectContaining({
              reasoning: expect.any(Object),
              score: expect.any(Object),
            }),
          }),
        }),
      );
    });

    it("should pass model config to LLM", async () => {
      const modelConfig = {
        provider: "anthropic",
        model: "claude-3-opus",
        apiKey: { adapter: "anthropic", secretKey: "anthropic-key" },
        modelParams: { temperature: 0.5 },
      };

      const callLLM = vi.fn().mockResolvedValue({
        score: 0.9,
        reasoning: "Excellent",
      });

      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: vi.fn().mockResolvedValue({
          valid: true,
          config: modelConfig,
        }),
        callLLM,
        uploadScore: vi.fn(),
        enqueueScoreIngestion: vi.fn(),
        updateJobExecution: vi.fn(),
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

      expect(callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          modelConfig,
        }),
      );
    });
  });

  describe("execution metadata", () => {
    it("should include dataset item ID in metadata when present", async () => {
      const jobWithDatasetItem = {
        ...mockJobExecution,
        jobInputDatasetItemId: "dataset-item-123",
      };

      const callLLM = vi.fn().mockResolvedValue({
        score: 0.75,
        reasoning: "Dataset evaluation complete",
      });
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
        callLLM,
        uploadScore,
        enqueueScoreIngestion: vi.fn(),
        updateJobExecution: vi.fn(),
      });

      await executeLLMAsJudgeEvaluation({
        projectId,
        jobExecutionId,
        job: jobWithDatasetItem,
        config: mockJobConfiguration,
        template: mockEvalTemplate,
        extractedVariables,
        environment: "production",
        deps,
      });

      // Verify metadata in LLM call includes dataset item ID
      expect(callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          traceSinkParams: expect.objectContaining({
            metadata: expect.objectContaining({
              target_dataset_item_id: "dataset-item-123",
            }),
          }),
        }),
      );

      // Verify metadata in score event includes dataset item ID
      expect(uploadScore).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            body: expect.objectContaining({
              metadata: expect.objectContaining({
                target_dataset_item_id: "dataset-item-123",
              }),
            }),
          }),
        }),
      );
    });

    it("should include observation ID in metadata when present", async () => {
      const jobWithObservation = {
        ...mockJobExecution,
        jobInputObservationId: "obs-456",
      };

      const callLLM = vi.fn().mockResolvedValue({
        score: 0.85,
        reasoning: "Observation evaluation complete",
      });
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
        callLLM,
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

      // Verify metadata in LLM call includes observation ID
      expect(callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          traceSinkParams: expect.objectContaining({
            metadata: expect.objectContaining({
              target_observation_id: "obs-456",
            }),
          }),
        }),
      );

      // Verify metadata in score event includes observation ID
      expect(uploadScore).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            body: expect.objectContaining({
              metadata: expect.objectContaining({
                target_observation_id: "obs-456",
              }),
            }),
          }),
        }),
      );
    });

    it("should include all job identifiers in full evaluation context", async () => {
      const fullJob = {
        ...mockJobExecution,
        jobInputObservationId: "obs-full",
        jobInputDatasetItemId: "dataset-full",
      };

      const callLLM = vi.fn().mockResolvedValue({
        score: 0.95,
        reasoning: "Complete evaluation",
      });
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
        callLLM,
        uploadScore,
        enqueueScoreIngestion: vi.fn(),
        updateJobExecution: vi.fn(),
      });

      await executeLLMAsJudgeEvaluation({
        projectId,
        jobExecutionId,
        job: fullJob,
        config: mockJobConfiguration,
        template: mockEvalTemplate,
        extractedVariables,
        environment: "production",
        deps,
      });

      // Verify all identifiers are in metadata
      const expectedMetadata = {
        job_execution_id: jobExecutionId,
        job_configuration_id: fullJob.jobConfigurationId,
        target_trace_id: fullJob.jobInputTraceId,
        target_observation_id: "obs-full",
        target_dataset_item_id: "dataset-full",
      };

      expect(callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          traceSinkParams: expect.objectContaining({
            metadata: expect.objectContaining(expectedMetadata),
          }),
        }),
      );

      expect(uploadScore).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            body: expect.objectContaining({
              metadata: expect.objectContaining(expectedMetadata),
            }),
          }),
        }),
      );
    });
  });

  describe("score event structure", () => {
    it("should build complete score event with all required fields", async () => {
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
          score: 0.88,
          reasoning: "Well structured response",
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
        extractedVariables,
        environment: "production",
        deps,
      });

      expect(uploadScore).toHaveBeenCalledWith({
        projectId,
        scoreId: expect.any(String),
        eventId: expect.any(String),
        event: {
          id: expect.any(String),
          timestamp: expect.any(String),
          type: "score-create",
          body: {
            id: expect.any(String),
            traceId: mockJobExecution.jobInputTraceId,
            observationId: null,
            name: mockJobConfiguration.scoreName,
            value: 0.88,
            comment: "Well structured response",
            source: "EVAL",
            environment: "production",
            executionTraceId: expect.any(String),
            metadata: expect.objectContaining({
              job_execution_id: jobExecutionId,
              job_configuration_id: mockJobExecution.jobConfigurationId,
              target_trace_id: mockJobExecution.jobInputTraceId,
            }),
            dataType: "NUMERIC",
          },
        },
      });
    });

    it("should use same scoreId in uploadScore and updateJobExecution", async () => {
      const uploadScore = vi.fn();
      const updateJobExecution = vi.fn();

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
          reasoning: "Consistent IDs",
        }),
        uploadScore,
        enqueueScoreIngestion: vi.fn(),
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

      // Extract the scoreId from uploadScore call
      const uploadCall = uploadScore.mock.calls[0][0];
      const scoreId = uploadCall.scoreId;

      // Verify the same scoreId is used in updateJobExecution
      expect(updateJobExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            jobOutputScoreId: scoreId,
          }),
        }),
      );
    });

    it("should use same executionTraceId in score event and job update", async () => {
      const uploadScore = vi.fn();
      const updateJobExecution = vi.fn();

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
          score: 0.6,
          reasoning: "Trace ID consistency",
        }),
        uploadScore,
        enqueueScoreIngestion: vi.fn(),
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

      // Extract the executionTraceId from uploadScore call
      const uploadCall = uploadScore.mock.calls[0][0];
      const executionTraceId = uploadCall.event.body.executionTraceId;

      // Verify the same executionTraceId is used in updateJobExecution
      expect(updateJobExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            executionTraceId,
          }),
        }),
      );
    });
  });

  describe("LLM errors", () => {
    it("should propagate LLM exception for BullMQ retry", async () => {
      const llmError = new Error("LLM service unavailable");

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
        callLLM: vi.fn().mockRejectedValue(llmError),
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
      ).rejects.toThrow("LLM service unavailable");
    });

    it("should propagate rate limit errors from LLM", async () => {
      const rateLimitError = new Error("Rate limit exceeded");
      (rateLimitError as unknown as { isRetryable: boolean }).isRetryable =
        true;

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
        callLLM: vi.fn().mockRejectedValue(rateLimitError),
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
      ).rejects.toThrow("Rate limit exceeded");
    });
  });

  describe("job execution update errors", () => {
    it("should propagate updateJobExecution errors", async () => {
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
        enqueueScoreIngestion: vi.fn(),
        updateJobExecution: vi
          .fn()
          .mockRejectedValue(new Error("Database connection lost")),
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
      ).rejects.toThrow("Database connection lost");
    });

    it("should have persisted score before job update fails", async () => {
      const uploadScore = vi.fn();
      const enqueueScoreIngestion = vi.fn();

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
        uploadScore,
        enqueueScoreIngestion,
        updateJobExecution: vi
          .fn()
          .mockRejectedValue(new Error("Database connection lost")),
      });

      try {
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
      } catch {
        // Expected to throw
      }

      // Score should have been persisted before the job update error
      expect(uploadScore).toHaveBeenCalledTimes(1);
      expect(enqueueScoreIngestion).toHaveBeenCalledTimes(1);
    });
  });
});
