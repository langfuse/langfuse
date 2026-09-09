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
      evaluationRuleEvaluatorAssignment: {
        findFirst: vi.fn(),
      },
      evaluator: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
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
  evaluationContext: {
    evaluatorExecutionIsTest: false,
  },
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

  const mockMigratedAssignment = (
    config: ReturnType<typeof createMockJobConfiguration>,
  ) => {
    const template = config.evalTemplate;
    if (!template) throw new Error("Test evaluator template is required");
    const rule = {
      id: config.id,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      projectId: config.projectId,
      name: config.scoreName,
      status: config.status,
      targetObject: config.targetObject,
      filter: config.filter,
      sampling: config.sampling,
      delay: config.delay,
      timeScope: config.timeScope,
    };
    const evaluator = {
      id: `evaluator-${config.id}`,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      projectId: config.projectId,
      name: config.scoreName,
      type: template.type,
      blockedAt: config.blockedAt,
      project: { orgId: "test-org-123" },
      versions: [
        {
          id: template.id,
          createdAt: template.createdAt,
          version: template.version,
          prompt: template.prompt,
          partner: template.partner,
          model: template.model,
          provider: template.provider,
          modelParams: template.modelParams,
          vars: template.vars,
          variableMapping: config.variableMapping,
          outputDefinition: template.outputDefinition,
          sourceCode: template.sourceCode,
          sourceCodeLanguage: template.sourceCodeLanguage,
        },
      ],
    };
    const assignment = {
      id: `legacy:${config.id}`,
      variableMapping: config.variableMapping,
      evaluationRule: rule,
      evaluator,
    };
    (
      prisma.evaluationRuleEvaluatorAssignment.findFirst as Mock
    ).mockResolvedValue(assignment);
    return assignment;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (
      prisma.evaluationRuleEvaluatorAssignment.findFirst as Mock
    ).mockResolvedValue(null);
    (prisma.evaluator.findFirst as Mock).mockResolvedValue(null);
    (executeCodeBasedEvaluation as Mock).mockResolvedValue(
      mockEvalExecutionResult,
    );
    (runLLMAsJudgeEvaluation as Mock).mockResolvedValue(
      mockEvalExecutionResult,
    );
  });

  it.each([
    JobExecutionStatus.CANCELLED,
    JobExecutionStatus.ERROR,
    JobExecutionStatus.COMPLETED,
  ])("skips an already terminal %s execution", async (status) => {
    (prisma.jobExecution.findFirst as Mock).mockResolvedValue(
      createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status,
      }),
    );

    const outcome = await processObservationEval({
      event: baseEvent,
      executionType: EvalTemplateType.LLM_AS_JUDGE,
      deps: createMockProcessorDeps(),
    });

    expect(outcome).toBe("skipped");
    expect(runLLMAsJudgeEvaluation).not.toHaveBeenCalled();
    expect(executeCodeBasedEvaluation).not.toHaveBeenCalled();
    expect(prisma.jobExecution.update).not.toHaveBeenCalled();
  });

  describe("v2 execution resolution", () => {
    const rule = {
      id: "rule-123",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
      projectId,
      name: "Production quality",
      status: JobConfigState.ACTIVE,
      targetObject: "event",
      filter: [],
      sampling: 1,
      delay: 0,
      timeScope: ["NEW"],
    };
    const version = {
      id: "version-123",
      createdAt: new Date("2026-01-01"),
      version: 2,
      prompt: "Evaluate {{output}}",
      partner: null,
      model: "test-model",
      provider: "test-provider",
      modelParams: {},
      vars: ["output"],
      variableMapping: [],
      outputDefinition: { type: "NUMERIC" },
      sourceCode: null,
      sourceCodeLanguage: null,
    };
    const evaluator = {
      id: "evaluator-123",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
      projectId,
      name: "Quality",
      type: EvalTemplateType.LLM_AS_JUDGE,
      blockedAt: null,
      project: { orgId: "test-org-123" },
      versions: [version],
    };
    const assignment = {
      id: "assignment-123",
      variableMapping: [
        { templateVariable: "output", selectedColumnId: "output" },
      ],
      evaluationRule: rule,
      evaluator,
    };

    // The scheduler puts the evaluator identity on the queue payload; the
    // version is resolved here, not pinned at dispatch.
    const ruleEvent = {
      ...baseEvent,
      evaluatorId: evaluator.id,
      evaluationRuleId: rule.id,
    };

    const setupV2Job = () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        jobConfigurationId: rule.id,
        jobTemplateId: null,
        jobInputTraceId: "trace-abc",
        jobInputObservationId: "obs-xyz",
      });
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      (
        prisma.evaluationRuleEvaluatorAssignment.findFirst as Mock
      ).mockResolvedValue(assignment);
      return job;
    };

    it("resolves rule, evaluator and version through the assignment in one query", async () => {
      setupV2Job();
      const observation = createTestObservation({
        span_id: "obs-xyz",
        trace_id: "trace-abc",
        project_id: projectId,
        environment: "production",
      });
      const deps = createMockProcessorDeps({
        downloadObservationFromS3: vi
          .fn()
          .mockResolvedValue(JSON.stringify(observation)),
      });

      await processObservationEval({
        event: ruleEvent,
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps,
      });

      expect(
        prisma.evaluationRuleEvaluatorAssignment.findFirst,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectId,
            evaluationRuleId: rule.id,
            evaluatorId: evaluator.id,
            evaluator: { projectId, type: "LLM_AS_JUDGE" },
          },
        }),
      );
      expect(prisma.evaluator.findFirst).not.toHaveBeenCalled();
      expect(prisma.jobConfiguration.findFirst).not.toHaveBeenCalled();
      expect(runLLMAsJudgeEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            id: rule.id,
            variableMapping: assignment.variableMapping,
          }),
          template: expect.objectContaining({ id: version.id }),
          executionMetadata: expect.objectContaining({
            evaluation_rule_assignment_id: assignment.id,
            evaluator_version_id: version.id,
          }),
          evaluationContext: {
            evaluatorId: evaluator.id,
            evaluationRuleId: rule.id,
            evaluatorExecutionIsTest: false,
          },
          // Pausing targets the evaluator, not the rule it ran for.
          evaluatorId: evaluator.id,
        }),
      );
    });

    it("uses the canonical mapping for code evaluators without a stored mapping", async () => {
      setupV2Job();
      (
        prisma.evaluationRuleEvaluatorAssignment.findFirst as Mock
      ).mockResolvedValue({
        ...assignment,
        variableMapping: null,
        evaluator: {
          ...evaluator,
          type: EvalTemplateType.CODE,
          versions: [
            {
              ...version,
              prompt: null,
              variableMapping: null,
              sourceCode: "return true;",
              sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
            },
          ],
        },
      });
      const observation = createTestObservation({
        span_id: "obs-xyz",
        trace_id: "trace-abc",
        project_id: projectId,
        input: '{"question":"What is the capital of Germany?"}',
      });
      const deps = createMockProcessorDeps({
        downloadObservationFromS3: vi
          .fn()
          .mockResolvedValue(JSON.stringify(observation)),
      });

      await processObservationEval({
        event: ruleEvent,
        executionType: EvalTemplateType.CODE,
        deps,
      });

      expect(executeCodeBasedEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          evaluatorId: evaluator.id,
          template: expect.objectContaining({ id: version.id }),
          extractedVariables: expect.arrayContaining([
            expect.objectContaining({
              var: "input",
              value: { question: "What is the capital of Germany?" },
            }),
          ]),
        }),
      );
    });

    it("cancels when the rule was disabled after scheduling", async () => {
      const job = setupV2Job();
      (
        prisma.evaluationRuleEvaluatorAssignment.findFirst as Mock
      ).mockResolvedValue({
        ...assignment,
        evaluationRule: { ...rule, status: JobConfigState.INACTIVE },
      });

      await processObservationEval({
        event: ruleEvent,
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps: createMockProcessorDeps(),
      });

      expect(prisma.jobExecution.update).toHaveBeenCalledWith({
        where: { id: job.id, projectId },
        data: {
          status: JobExecutionStatus.CANCELLED,
          endTime: expect.any(Date),
        },
      });
      expect(runLLMAsJudgeEvaluation).not.toHaveBeenCalled();
    });

    it("cancels when the rule, evaluator or their pairing is gone", async () => {
      // A deleted rule, a deleted or detached evaluator and a type mismatch
      // all resolve to no assignment row.
      setupV2Job();
      (
        prisma.evaluationRuleEvaluatorAssignment.findFirst as Mock
      ).mockResolvedValue(null);

      await processObservationEval({
        event: ruleEvent,
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps: createMockProcessorDeps(),
      });

      expect(prisma.jobExecution.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: JobExecutionStatus.CANCELLED,
          }),
        }),
      );
      expect(runLLMAsJudgeEvaluation).not.toHaveBeenCalled();
    });

    it.each([
      ["blocked evaluator", { ...evaluator, blockedAt: new Date() }],
      ["evaluator without versions", { ...evaluator, versions: [] }],
    ])("cancels for a %s", async (_label, resolvedEvaluator) => {
      setupV2Job();
      (
        prisma.evaluationRuleEvaluatorAssignment.findFirst as Mock
      ).mockResolvedValue({ ...assignment, evaluator: resolvedEvaluator });

      await processObservationEval({
        event: ruleEvent,
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps: createMockProcessorDeps(),
      });

      expect(prisma.jobExecution.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: JobExecutionStatus.CANCELLED,
          }),
        }),
      );
      expect(runLLMAsJudgeEvaluation).not.toHaveBeenCalled();
    });

    it("resolves a batch-run evaluator without a rule", async () => {
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(
        createMockJobExecution({
          id: jobExecutionId,
          projectId,
          jobConfigurationId: evaluator.id,
          jobTemplateId: null,
        }),
      );
      (prisma.evaluator.findFirst as Mock).mockResolvedValue(evaluator);

      await processObservationEval({
        event: {
          ...baseEvent,
          executionMode: "MANUAL",
          evaluatorId: evaluator.id,
        },
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps: createMockProcessorDeps(),
      });

      // No rule id on the payload means no assignment lookup, so a backfilled
      // rule that happens to reuse the evaluator id can never be picked up.
      expect(
        prisma.evaluationRuleEvaluatorAssignment.findFirst,
      ).not.toHaveBeenCalled();
      expect(runLLMAsJudgeEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ id: evaluator.id }),
          executionMetadata: expect.objectContaining({
            evaluator_version_id: version.id,
          }),
          evaluationContext: {
            evaluatorId: evaluator.id,
            evaluationRuleId: evaluator.id,
            evaluatorExecutionIsTest: false,
          },
        }),
      );
    });

    it("uses a queue mapping override for a batch-run evaluator without a rule", async () => {
      const variableMapping = [
        { templateVariable: "output", selectedColumnId: "input" },
      ];
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(
        createMockJobExecution({
          id: jobExecutionId,
          projectId,
          jobConfigurationId: evaluator.id,
          jobTemplateId: null,
        }),
      );
      (prisma.evaluator.findFirst as Mock).mockResolvedValue(evaluator);

      await processObservationEval({
        event: {
          ...baseEvent,
          executionMode: "MANUAL",
          evaluatorId: evaluator.id,
          variableMapping,
        },
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps: createMockProcessorDeps(),
      });

      expect(
        prisma.evaluationRuleEvaluatorAssignment.findFirst,
      ).not.toHaveBeenCalled();
      expect(runLLMAsJudgeEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ variableMapping }),
          executionMetadata: expect.not.objectContaining({
            evaluation_rule_assignment_id: expect.anything(),
          }),
        }),
      );
    });

    it("uses an empty variable mapping when neither v2 mapping is configured", async () => {
      setupV2Job();
      (
        prisma.evaluationRuleEvaluatorAssignment.findFirst as Mock
      ).mockResolvedValue({
        ...assignment,
        variableMapping: null,
        evaluator: {
          ...evaluator,
          versions: [{ ...version, variableMapping: null }],
        },
      });

      await processObservationEval({
        event: ruleEvent,
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps: createMockProcessorDeps(),
      });

      expect(runLLMAsJudgeEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ variableMapping: [] }),
        }),
      );
    });

    it("resolves jobs queued before evaluator v2 through their migrated rule", async () => {
      const legacyConfig = createMockJobConfiguration({
        id: "legacy-config-123",
        projectId,
        evalTemplateId: "template-123",
      });
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(
        createMockJobExecution({
          id: jobExecutionId,
          projectId,
          jobConfigurationId: legacyConfig.id,
          // A template the configuration no longer points at: the pre-v2
          // worker resolved through the configuration, not the pinned id.
          jobTemplateId: "template-122",
        }),
      );
      (
        prisma.evaluationRuleEvaluatorAssignment.findFirst as Mock
      ).mockResolvedValue({
        ...assignment,
        evaluationRule: { ...rule, id: legacyConfig.id },
      });

      await processObservationEval({
        event: baseEvent,
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps: createMockProcessorDeps(),
      });

      expect(
        prisma.evaluationRuleEvaluatorAssignment.findFirst,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId,
            evaluationRuleId: legacyConfig.id,
          }),
        }),
      );
      expect(prisma.jobConfiguration.findFirst).not.toHaveBeenCalled();
      expect(runLLMAsJudgeEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          evaluatorId: evaluator.id,
          config: expect.objectContaining({ id: legacyConfig.id }),
          evaluationContext: {
            evaluatorId: evaluator.id,
            evaluationRuleId: legacyConfig.id,
            evaluatorExecutionIsTest: false,
          },
        }),
      );
    });
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

  describe("template type filtering", () => {
    it("should reject an incomplete template before execution", async () => {
      const job = createMockJobExecution({
        id: jobExecutionId,
        projectId,
        status: JobExecutionStatus.PENDING,
        jobConfigurationId: "config-123",
      });
      const config = createMockJobConfiguration({
        id: "config-123",
        projectId,
        evalTemplate: createMockEvalTemplate({
          type: EvalTemplateType.CODE,
          prompt: null,
          outputDefinition: null,
          sourceCode: null,
          sourceCodeLanguage: null,
        }),
      });
      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      mockMigratedAssignment(config);
      const deps = createMockProcessorDeps();

      await expect(
        processObservationEval({
          event: baseEvent,
          executionType: EvalTemplateType.CODE,
          deps,
        }),
      ).rejects.toThrow("Evaluator template is incomplete for CODE execution");
      expect(deps.downloadObservationFromS3).not.toHaveBeenCalled();
      expect(executeCodeBasedEvaluation).not.toHaveBeenCalled();
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
      mockMigratedAssignment(config);

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
      mockMigratedAssignment(config);

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
      mockMigratedAssignment(config);

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
      mockMigratedAssignment(config);

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
      mockMigratedAssignment(config);

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
      mockMigratedAssignment(config);

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

      expect(
        prisma.evaluationRuleEvaluatorAssignment.findFirst,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            evaluationRuleId: config.id,
            evaluator: {
              projectId,
              type: EvalTemplateType.LLM_AS_JUDGE,
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
              value: { response: "test output" },
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
      mockMigratedAssignment(config);

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
      mockMigratedAssignment(config);

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
              value: { response: "test output" },
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
      mockMigratedAssignment(config);

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
      mockMigratedAssignment(config);

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
              value: { prompt: "Hello" },
            }),
            expect.objectContaining({
              var: "output",
              value: { response: "World" },
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
      mockMigratedAssignment(config);

      // Without injected deps, it will try to use real S3 which should fail
      await expect(
        processObservationEval({
          event: baseEvent,
          executionType: EvalTemplateType.LLM_AS_JUDGE,
        }),
      ).rejects.toThrow();
    });
  });

  describe("internal target loop safeguard", () => {
    const setupExecutableJob = (environment: string) => {
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
        environment,
        output: '{"response": "test output"}',
      });

      (prisma.jobExecution.findFirst as Mock).mockResolvedValue(job);
      mockMigratedAssignment(config);

      return createMockProcessorDeps({
        downloadObservationFromS3: vi
          .fn()
          .mockResolvedValue(JSON.stringify(observation)),
      });
    };

    it("cancels jobs targeting internal observations instead of executing (eval-on-eval loop guard)", async () => {
      const deps = setupExecutableJob("langfuse-llm-as-a-judge");

      await processObservationEval({
        event: baseEvent,
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps,
      });

      expect(runLLMAsJudgeEvaluation).not.toHaveBeenCalled();
      expect(executeCodeBasedEvaluation).not.toHaveBeenCalled();
      expect(prisma.jobExecution.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: JobExecutionStatus.CANCELLED,
          }),
        }),
      );
    });

    it("executes evals on sanctioned prompt-experiment targets", async () => {
      const deps = setupExecutableJob("langfuse-prompt-experiment");

      await processObservationEval({
        event: baseEvent,
        executionType: EvalTemplateType.LLM_AS_JUDGE,
        deps,
      });

      expect(runLLMAsJudgeEvaluation).toHaveBeenCalledTimes(1);
    });
  });
});
