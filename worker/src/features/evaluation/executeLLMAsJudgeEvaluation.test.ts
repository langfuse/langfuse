import { describe, expect, it, vi, type Mock } from "vitest";
import { JobExecutionStatus } from "@prisma/client";
import { executeLLMAsJudgeEvaluation } from "./evalService";
import { createMockEvalExecutionDeps } from "./evalExecutionDeps";
import { UnrecoverableError } from "../../errors/UnrecoverableError";
import { ExtractedVariable } from "./observationEval/extractObservationVariables";
import { EvalTargetObject } from "@langfuse/shared";

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

  // ============================================================================
  // Test Fixtures
  // ============================================================================

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
    targetObject: EvalTargetObject.TRACE,
    filter: [],
    variableMapping: [],
    sampling: "1.0",
    delay: 0,
    status: "ACTIVE" as const,
    timeScope: ["NEW" as const],
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

  // ============================================================================
  // Mock Helpers
  // ============================================================================

  /** Default valid model configuration for OpenAI GPT-4 */
  const defaultModelConfig = {
    provider: "openai",
    model: "gpt-4",
    apiKey: { adapter: "openai", secretKey: "test-key" },
    modelParams: {},
  };

  /** Creates a mock for fetchModelConfig that returns a valid config */
  const mockValidFetchModelConfig = () =>
    vi.fn().mockResolvedValue({
      valid: true,
      config: defaultModelConfig,
    });

  /** Creates a mock for callLLM with a successful response */
  const mockSuccessfulLLMCall = (score: number, reasoning: string) =>
    vi.fn().mockResolvedValue({ score, reasoning });

  /** Creates standard deps with all mocks for a successful execution flow */
  const createSuccessfulDeps = (
    overrides: {
      callLLM?: Mock;
      uploadScore?: Mock;
      enqueueScoreIngestion?: Mock;
      updateJobExecution?: Mock;
    } = {},
  ) =>
    createMockEvalExecutionDeps({
      fetchModelConfig: mockValidFetchModelConfig(),
      callLLM: overrides.callLLM ?? mockSuccessfulLLMCall(0.8, "Good"),
      uploadScore: overrides.uploadScore ?? vi.fn(),
      enqueueScoreIngestion: overrides.enqueueScoreIngestion ?? vi.fn(),
      updateJobExecution: overrides.updateJobExecution ?? vi.fn(),
    });

  /** Standard execution params for most tests */
  const createExecutionParams = (
    overrides: {
      job?: typeof mockJobExecution;
      template?: typeof mockEvalTemplate;
      variables?: ExtractedVariable[];
      environment?: string;
      deps?: ReturnType<typeof createMockEvalExecutionDeps>;
    } = {},
  ) => ({
    projectId,
    jobExecutionId,
    job: overrides.job ?? mockJobExecution,
    config: mockJobConfiguration,
    template: overrides.template ?? mockEvalTemplate,
    extractedVariables: overrides.variables ?? extractedVariables,
    environment: overrides.environment ?? "production",
    deps: overrides.deps ?? createSuccessfulDeps(),
  });

  describe("successful execution", () => {
    it("should complete evaluation successfully", async () => {
      const callLLM = mockSuccessfulLLMCall(0.85, "High accuracy observed");
      const uploadScore = vi.fn();
      const enqueueScoreIngestion = vi.fn();
      const updateJobExecution = vi.fn();

      const deps = createSuccessfulDeps({
        callLLM,
        uploadScore,
        enqueueScoreIngestion,
        updateJobExecution,
      });

      await executeLLMAsJudgeEvaluation(createExecutionParams({ deps }));

      expect(callLLM).toHaveBeenCalledTimes(1);
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
      expect(enqueueScoreIngestion).toHaveBeenCalledTimes(1);
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
      const uploadScore = vi.fn();
      const deps = createSuccessfulDeps({
        callLLM: mockSuccessfulLLMCall(0.9, "Excellent"),
        uploadScore,
      });

      await executeLLMAsJudgeEvaluation(
        createExecutionParams({
          job: { ...mockJobExecution, jobInputObservationId: "obs-123" },
          deps,
        }),
      );

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
      const deps = createSuccessfulDeps({ uploadScore });

      await executeLLMAsJudgeEvaluation(
        createExecutionParams({
          variables: [{ var: "output", value: "test" }],
          environment: "staging",
          deps,
        }),
      );

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
      const deps = createSuccessfulDeps({
        callLLM: mockSuccessfulLLMCall(0.5, "Average"),
        uploadScore,
      });

      await executeLLMAsJudgeEvaluation(
        createExecutionParams({
          variables: [{ var: "output", value: "test" }],
          environment: "default",
          deps,
        }),
      );

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
        executeLLMAsJudgeEvaluation(createExecutionParams({ deps })),
      ).rejects.toThrow(UnrecoverableError);
    });

    it("should throw UnrecoverableError if output schema invalid", async () => {
      const templateWithBadSchema = {
        ...mockEvalTemplate,
        outputSchema: { invalidKey: "value" },
      };

      await expect(
        executeLLMAsJudgeEvaluation(
          createExecutionParams({
            template: templateWithBadSchema,
            deps: createMockEvalExecutionDeps({}),
          }),
        ),
      ).rejects.toThrow(UnrecoverableError);
    });
  });

  describe("LLM response errors", () => {
    it("should throw UnrecoverableError for invalid LLM response", async () => {
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: mockValidFetchModelConfig(),
        callLLM: vi.fn().mockResolvedValue({
          score: "high", // Invalid - should be number
          reasoning: "Good response",
        }),
      });

      await expect(
        executeLLMAsJudgeEvaluation(createExecutionParams({ deps })),
      ).rejects.toThrow(UnrecoverableError);
    });

    it("should throw UnrecoverableError for missing LLM response fields", async () => {
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: mockValidFetchModelConfig(),
        callLLM: vi.fn().mockResolvedValue({
          score: 0.8,
          // Missing reasoning field
        }),
      });

      await expect(
        executeLLMAsJudgeEvaluation(createExecutionParams({ deps })),
      ).rejects.toThrow(UnrecoverableError);
    });
  });

  describe("score persistence errors", () => {
    it("should throw error if score upload fails", async () => {
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: mockValidFetchModelConfig(),
        callLLM: mockSuccessfulLLMCall(0.8, "Good"),
        uploadScore: vi.fn().mockRejectedValue(new Error("S3 upload failed")),
      });

      await expect(
        executeLLMAsJudgeEvaluation(createExecutionParams({ deps })),
      ).rejects.toThrow("Failed to write score");
    });

    it("should throw error if score ingestion queue fails", async () => {
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: mockValidFetchModelConfig(),
        callLLM: mockSuccessfulLLMCall(0.8, "Good"),
        uploadScore: vi.fn(),
        enqueueScoreIngestion: vi
          .fn()
          .mockRejectedValue(new Error("Queue unavailable")),
      });

      await expect(
        executeLLMAsJudgeEvaluation(createExecutionParams({ deps })),
      ).rejects.toThrow("Failed to write score");
    });
  });

  describe("prompt compilation", () => {
    it("should handle prompt compilation errors gracefully", async () => {
      const templateWithBadPrompt = {
        ...mockEvalTemplate,
        prompt: "Evaluate {{unclosed_bracket",
      };

      const uploadScore = vi.fn();
      const deps = createSuccessfulDeps({
        callLLM: mockSuccessfulLLMCall(0.5, "Could not parse properly"),
        uploadScore,
      });

      // Should not throw - falls back to raw template
      await executeLLMAsJudgeEvaluation(
        createExecutionParams({ template: templateWithBadPrompt, deps }),
      );

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

      const callLLM = mockSuccessfulLLMCall(1.0, "Perfect match");
      const deps = createSuccessfulDeps({ callLLM });

      await executeLLMAsJudgeEvaluation(
        createExecutionParams({
          template: multiVarTemplate,
          variables: multiVariables,
          deps,
        }),
      );

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
      const callLLM = mockSuccessfulLLMCall(0.8, "Good response");
      const deps = createSuccessfulDeps({ callLLM });

      await executeLLMAsJudgeEvaluation(createExecutionParams({ deps }));

      expect(callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          traceSinkParams: expect.objectContaining({
            targetProjectId: projectId,
            traceId: expect.any(String),
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
      const callLLM = mockSuccessfulLLMCall(0.8, "Good response");
      const deps = createSuccessfulDeps({ callLLM });

      await executeLLMAsJudgeEvaluation(createExecutionParams({ deps }));

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
      const customModelConfig = {
        provider: "anthropic",
        model: "claude-3-opus",
        apiKey: { adapter: "anthropic", secretKey: "anthropic-key" },
        modelParams: { temperature: 0.5 },
      };

      const callLLM = mockSuccessfulLLMCall(0.9, "Excellent");
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: vi.fn().mockResolvedValue({
          valid: true,
          config: customModelConfig,
        }),
        callLLM,
        uploadScore: vi.fn(),
        enqueueScoreIngestion: vi.fn(),
        updateJobExecution: vi.fn(),
      });

      await executeLLMAsJudgeEvaluation(createExecutionParams({ deps }));

      expect(callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          modelConfig: customModelConfig,
        }),
      );
    });
  });

  describe("execution metadata", () => {
    it("should include dataset item ID in metadata when present", async () => {
      const callLLM = mockSuccessfulLLMCall(
        0.75,
        "Dataset evaluation complete",
      );
      const uploadScore = vi.fn();
      const deps = createSuccessfulDeps({ callLLM, uploadScore });

      await executeLLMAsJudgeEvaluation(
        createExecutionParams({
          job: {
            ...mockJobExecution,
            jobInputDatasetItemId: "dataset-item-123",
          },
          deps,
        }),
      );

      expect(callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          traceSinkParams: expect.objectContaining({
            metadata: expect.objectContaining({
              target_dataset_item_id: "dataset-item-123",
            }),
          }),
        }),
      );

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
      const callLLM = mockSuccessfulLLMCall(
        0.85,
        "Observation evaluation complete",
      );
      const uploadScore = vi.fn();
      const deps = createSuccessfulDeps({ callLLM, uploadScore });

      await executeLLMAsJudgeEvaluation(
        createExecutionParams({
          job: { ...mockJobExecution, jobInputObservationId: "obs-456" },
          deps,
        }),
      );

      expect(callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          traceSinkParams: expect.objectContaining({
            metadata: expect.objectContaining({
              target_observation_id: "obs-456",
            }),
          }),
        }),
      );

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

      const callLLM = mockSuccessfulLLMCall(0.95, "Complete evaluation");
      const uploadScore = vi.fn();
      const deps = createSuccessfulDeps({ callLLM, uploadScore });

      await executeLLMAsJudgeEvaluation(
        createExecutionParams({ job: fullJob, deps }),
      );

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
      const deps = createSuccessfulDeps({
        callLLM: mockSuccessfulLLMCall(0.88, "Well structured response"),
        uploadScore,
      });

      await executeLLMAsJudgeEvaluation(createExecutionParams({ deps }));

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
      const deps = createSuccessfulDeps({
        callLLM: mockSuccessfulLLMCall(0.7, "Consistent IDs"),
        uploadScore,
        updateJobExecution,
      });

      await executeLLMAsJudgeEvaluation(createExecutionParams({ deps }));

      const uploadCall = uploadScore.mock.calls[0][0];
      const scoreId = uploadCall.scoreId;

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
      const deps = createSuccessfulDeps({
        callLLM: mockSuccessfulLLMCall(0.6, "Trace ID consistency"),
        uploadScore,
        updateJobExecution,
      });

      await executeLLMAsJudgeEvaluation(createExecutionParams({ deps }));

      const uploadCall = uploadScore.mock.calls[0][0];
      const executionTraceId = uploadCall.event.body.executionTraceId;

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
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: mockValidFetchModelConfig(),
        callLLM: vi
          .fn()
          .mockRejectedValue(new Error("LLM service unavailable")),
      });

      await expect(
        executeLLMAsJudgeEvaluation(createExecutionParams({ deps })),
      ).rejects.toThrow("LLM service unavailable");
    });

    it("should propagate rate limit errors from LLM", async () => {
      const rateLimitError = new Error("Rate limit exceeded");
      (rateLimitError as unknown as { isRetryable: boolean }).isRetryable =
        true;

      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: mockValidFetchModelConfig(),
        callLLM: vi.fn().mockRejectedValue(rateLimitError),
      });

      await expect(
        executeLLMAsJudgeEvaluation(createExecutionParams({ deps })),
      ).rejects.toThrow("Rate limit exceeded");
    });
  });

  describe("job execution update errors", () => {
    it("should propagate updateJobExecution errors", async () => {
      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: mockValidFetchModelConfig(),
        callLLM: mockSuccessfulLLMCall(0.8, "Good"),
        uploadScore: vi.fn(),
        enqueueScoreIngestion: vi.fn(),
        updateJobExecution: vi
          .fn()
          .mockRejectedValue(new Error("Database connection lost")),
      });

      await expect(
        executeLLMAsJudgeEvaluation(createExecutionParams({ deps })),
      ).rejects.toThrow("Database connection lost");
    });

    it("should have persisted score before job update fails", async () => {
      const uploadScore = vi.fn();
      const enqueueScoreIngestion = vi.fn();

      const deps = createMockEvalExecutionDeps({
        fetchModelConfig: mockValidFetchModelConfig(),
        callLLM: mockSuccessfulLLMCall(0.8, "Good"),
        uploadScore,
        enqueueScoreIngestion,
        updateJobExecution: vi
          .fn()
          .mockRejectedValue(new Error("Database connection lost")),
      });

      try {
        await executeLLMAsJudgeEvaluation(createExecutionParams({ deps }));
      } catch {
        // Expected to throw
      }

      // Score should have been persisted before the job update error
      expect(uploadScore).toHaveBeenCalledTimes(1);
      expect(enqueueScoreIngestion).toHaveBeenCalledTimes(1);
    });
  });
});
