import { beforeEach, vi } from "vitest";
import type * as SharedEnvModule from "@langfuse/shared/src/env";

const { runCodeEvalTestForJobConfigMock } = vi.hoisted(() => {
  process.env.LANGFUSE_CODE_EVAL_DISPATCHER = "insecure-local";
  process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";

  return {
    runCodeEvalTestForJobConfigMock: vi.fn(),
  };
});

vi.mock("@langfuse/shared/src/env", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedEnvModule>();

  return {
    ...actual,
    env: {
      ...actual.env,
      LANGFUSE_CODE_EVAL_DISPATCHER: "insecure-local",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    },
  };
});

vi.mock("@/src/features/evals/server/codeEvalTestRun", () => ({
  runCodeEvalTest: vi.fn(),
  runCodeEvalTestForJobConfig: runCodeEvalTestForJobConfigMock,
}));

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
} from "@prisma/client";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  createBooleanEvalOutputDefinition,
  createCategoricalEvalOutputDefinition,
  createNumericEvalOutputDefinition,
  EvalTargetObject,
  EvaluatorBlockReason,
} from "@langfuse/shared";
import type { Session } from "next-auth";

beforeEach(() => {
  runCodeEvalTestForJobConfigMock.mockReset();
  runCodeEvalTestForJobConfigMock.mockResolvedValue({
    success: true,
    result: { scores: [] },
    executionTraceId: "test-execution-trace-id",
    executionTraceFromTimestamp: new Date("2026-05-27T00:00:00.000Z"),
  });
});

const __orgIds: string[] = [];

async function prepare() {
  const { project, org } = await createOrgProjectAndApiKey();

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              metadata: {},
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: true,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  __orgIds.push(org.id);

  return { project, org, session, ctx, caller };
}

describe("evals trpc", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: { in: __orgIds },
      },
    });
  });

  describe("evals.allConfigs", () => {
    it("should retrieve all evaluator configurations without execution status counts", async () => {
      const { project, caller } = await prepare();

      const evalJobConfig1 = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
        },
      });

      await prisma.jobExecution.create({
        data: {
          jobConfigurationId: evalJobConfig1.id,
          status: "PENDING",
          projectId: project.id,
        },
      });

      await prisma.jobExecution.create({
        data: {
          jobConfigurationId: evalJobConfig1.id,
          status: "COMPLETED",
          projectId: project.id,
        },
      });

      await prisma.jobExecution.create({
        data: {
          jobConfigurationId: evalJobConfig1.id,
          status: "ERROR",
          projectId: project.id,
        },
      });

      const evalJobConfig2 = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
        },
      });

      const response = await caller.evals.allConfigs({
        projectId: project.id,
        filter: [],
        orderBy: {
          column: "createdAt",
          order: "DESC",
        },
        limit: 10,
        page: 0,
      });

      expect(response).toEqual({
        configs: expect.arrayContaining([
          expect.objectContaining({
            id: evalJobConfig1.id,
            displayStatus: "ACTIVE",
          }),
          expect.objectContaining({
            id: evalJobConfig2.id,
            displayStatus: "ACTIVE",
          }),
        ]),
        totalCount: expect.any(Number),
      });
    });

    it("should order evaluators by display status as active, paused, inactive", async () => {
      const { project, caller } = await prepare();

      const inactiveEvaluator = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "inactive-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "INACTIVE",
          createdAt: new Date("2024-03-03T00:00:00.000Z"),
        },
      });

      const pausedEvaluator = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "paused-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          blockedAt: new Date("2024-03-04T00:00:00.000Z"),
          blockReason: EvaluatorBlockReason.EVAL_MODEL_CONFIG_INVALID,
          blockMessage: "Paused for verification",
          createdAt: new Date("2024-02-02T00:00:00.000Z"),
        },
      });

      const activeEvaluator = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "active-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
        },
      });

      const response = await caller.evals.allConfigs({
        projectId: project.id,
        filter: [],
        orderBy: {
          column: "status",
          order: "ASC",
        },
        limit: 10,
        page: 0,
      });

      expect(
        response.configs.map((config) => ({
          id: config.id,
          displayStatus: config.displayStatus,
        })),
      ).toEqual([
        { id: activeEvaluator.id, displayStatus: "ACTIVE" },
        { id: pausedEvaluator.id, displayStatus: "PAUSED" },
        { id: inactiveEvaluator.id, displayStatus: "INACTIVE" },
      ]);
    });
  });

  describe("evals.templateNames", () => {
    it("should return the latest template versions with output definitions", async () => {
      const { project, caller } = await prepare();

      await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: "numeric-template",
          version: 1,
          prompt: "Score this response",
          outputDefinition: createNumericEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription: "How good",
          }),
        },
      });

      const latestNumericTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: "numeric-template",
          version: 2,
          prompt: "Score this response again",
          outputDefinition: createNumericEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription: "How good",
          }),
        },
      });

      const categoricalTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: "categorical-template",
          version: 1,
          prompt: "Classify this response",
          outputDefinition: createCategoricalEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription: "Classification",
            categories: ["correct", "incorrect"],
          }),
        },
      });

      const booleanTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: "boolean-template",
          version: 1,
          prompt: "Judge whether the response satisfies the criteria",
          outputDefinition: createBooleanEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription:
              "Return true if the response satisfies the criteria, otherwise false",
          }),
        },
      });

      const response = await caller.evals.templateNames({
        projectId: project.id,
        page: 0,
        limit: 10,
      });

      expect(response.templates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            latestId: latestNumericTemplate.id,
            name: "numeric-template",
            outputDefinition: expect.objectContaining({
              dataType: "NUMERIC",
            }),
          }),
          expect.objectContaining({
            latestId: categoricalTemplate.id,
            name: "categorical-template",
            outputDefinition: expect.objectContaining({
              dataType: "CATEGORICAL",
            }),
          }),
          expect.objectContaining({
            latestId: booleanTemplate.id,
            name: "boolean-template",
            outputDefinition: expect.objectContaining({
              dataType: "BOOLEAN",
            }),
          }),
        ]),
      );
    });
  });

  describe("evals.jobExecutionCountsByEvaluatorIds", () => {
    it("should lazily retrieve execution status counts grouped by evaluator id", async () => {
      const { project, caller } = await prepare();

      const evalJobConfig1 = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
        },
      });

      await prisma.jobExecution.create({
        data: {
          jobConfigurationId: evalJobConfig1.id,
          status: "PENDING",
          projectId: project.id,
        },
      });

      await prisma.jobExecution.create({
        data: {
          jobConfigurationId: evalJobConfig1.id,
          status: "COMPLETED",
          projectId: project.id,
        },
      });

      await prisma.jobExecution.create({
        data: {
          jobConfigurationId: evalJobConfig1.id,
          status: "ERROR",
          projectId: project.id,
        },
      });

      const evalJobConfig2 = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score-2",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
        },
      });

      const response = await caller.evals.jobExecutionCountsByEvaluatorIds({
        projectId: project.id,
        evaluatorIds: [evalJobConfig1.id, evalJobConfig2.id],
      });

      expect(response).toEqual({
        [evalJobConfig1.id]: expect.arrayContaining([
          expect.objectContaining({
            status: "PENDING",
            count: 1,
          }),
          expect.objectContaining({
            status: "COMPLETED",
            count: 1,
          }),
          expect.objectContaining({
            status: "ERROR",
            count: 1,
          }),
        ]),
        [evalJobConfig2.id]: [],
      });
    });
  });

  describe("evals.createTemplate", () => {
    it("rejects Python code evaluators for the insecure-local dispatcher", async () => {
      const { project, caller } = await prepare();

      await expect(
        caller.evals.createTemplate({
          projectId: project.id,
          name: `python-code-template-${project.id}`,
          type: EvalTemplateType.CODE,
          sourceCode:
            'def evaluate(ctx):\n    return { "scores": [{ "name": "python-score", "value": 1 }] }',
          sourceCodeLanguage: EvalTemplateSourceCodeLanguage.PYTHON,
        }),
      ).rejects.toThrow(
        "This code evaluator language is not supported by the configured dispatcher.",
      );
    });
  });

  describe("evals.createJob", () => {
    it("saves experiment code evaluator configs without a matching observation", async () => {
      const { project, caller } = await prepare();
      runCodeEvalTestForJobConfigMock.mockResolvedValueOnce(null);

      const evalTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: `code-experiment-template-${project.id}`,
          version: 1,
          type: EvalTemplateType.CODE,
          prompt: null,
          outputDefinition: undefined,
          sourceCode:
            'function evaluate() { return { scores: [{ name: "experiment-score", value: 1 }] }; }',
          sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        },
      });

      const response = await caller.evals.createJob({
        projectId: project.id,
        evalTemplateId: evalTemplate.id,
        scoreName: "experiment-code-score",
        target: EvalTargetObject.EXPERIMENT,
        filter: [],
        mapping: [],
        sampling: 1,
        delay: 0,
        timeScope: ["NEW"],
      });

      const savedJob = await prisma.jobConfiguration.findUnique({
        where: { id: response.id },
      });

      expect(savedJob?.targetObject).toBe(EvalTargetObject.EXPERIMENT);
      expect(savedJob?.evalTemplateId).toBe(evalTemplate.id);
      expect(runCodeEvalTestForJobConfigMock).toHaveBeenCalledOnce();
    });

    it("rejects experiment code evaluator configs when the matching test run fails", async () => {
      const { project, caller } = await prepare();
      runCodeEvalTestForJobConfigMock.mockResolvedValueOnce({
        success: false,
        error: {
          code: "USER_CODE_ERROR",
          message: "Evaluator failed during test run",
        },
        executionTraceId: "test-execution-trace-id",
        executionTraceFromTimestamp: new Date("2026-05-27T00:00:00.000Z"),
      });

      const evalTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: `code-experiment-template-${project.id}`,
          version: 1,
          type: EvalTemplateType.CODE,
          prompt: null,
          outputDefinition: undefined,
          sourceCode:
            'function evaluate() { return { scores: [{ name: "experiment-score", value: 1 }] }; }',
          sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        },
      });

      await expect(
        caller.evals.createJob({
          projectId: project.id,
          evalTemplateId: evalTemplate.id,
          scoreName: "experiment-code-score",
          target: EvalTargetObject.EXPERIMENT,
          filter: [],
          mapping: [],
          sampling: 1,
          delay: 0,
          timeScope: ["NEW"],
        }),
      ).rejects.toThrow("Evaluator failed during test run");

      await expect(
        prisma.jobConfiguration.findFirst({
          where: {
            projectId: project.id,
            scoreName: "experiment-code-score",
          },
        }),
      ).resolves.toBeNull();
    });

    it("rejects observation-only variable mappings for trace evaluators", async () => {
      const { project, caller } = await prepare();

      const evalTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: "trace-template",
          version: 1,
          prompt: "Score this response",
          outputDefinition: createNumericEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription: "How good",
          }),
        },
      });

      await expect(
        caller.evals.createJob({
          projectId: project.id,
          evalTemplateId: evalTemplate.id,
          scoreName: "bad-trace-score",
          target: EvalTargetObject.TRACE,
          filter: [],
          mapping: [
            {
              templateVariable: "input",
              selectedColumnId: "input",
              jsonSelector: null,
            },
          ],
          sampling: 1,
          delay: 0,
          timeScope: ["NEW"],
        }),
      ).rejects.toThrow("Variable mapping does not match evaluator target.");

      await expect(
        prisma.jobConfiguration.findFirst({
          where: {
            projectId: project.id,
            scoreName: "bad-trace-score",
          },
        }),
      ).resolves.toBeNull();
    });

    it("rejects unsupported trace filters", async () => {
      const { project, caller } = await prepare();

      const evalTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: "trace-template",
          version: 1,
          prompt: "Score this response",
          outputDefinition: createNumericEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription: "How good",
          }),
        },
      });

      await expect(
        caller.evals.createJob({
          projectId: project.id,
          evalTemplateId: evalTemplate.id,
          scoreName: "bad-trace-filter",
          target: EvalTargetObject.TRACE,
          filter: [
            {
              type: "numberObject",
              column: "Scores (numeric)",
              key: "accuracy",
              operator: ">",
              value: 0.8,
            },
          ],
          mapping: [],
          sampling: 1,
          delay: 0,
          timeScope: ["NEW"],
        }),
      ).rejects.toThrow(
        'Filter column "Scores (numeric)" is not supported for target "trace".',
      );
    });

    it("creates an inactive clone of an existing evaluator configuration", async () => {
      const { project, caller } = await prepare();

      const evalTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: "clone-source-template",
          version: 1,
          prompt: "Score this response",
          outputDefinition: createNumericEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription: "How good",
          }),
        },
      });

      const sourceConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          evalTemplateId: evalTemplate.id,
          scoreName: "source-score",
          filter: [],
          targetObject: EvalTargetObject.EVENT,
          variableMapping: [
            {
              templateVariable: "input",
              selectedColumnId: "input",
              jsonSelector: null,
            },
          ],
          sampling: 1,
          delay: 10_000,
          status: "ACTIVE",
          timeScope: ["NEW", "EXISTING"],
        },
      });

      const response = await caller.evals.createJob({
        projectId: project.id,
        evalTemplateId: evalTemplate.id,
        scoreName: "source-score (copy)",
        target: EvalTargetObject.EVENT,
        filter: [],
        mapping: [
          {
            templateVariable: "input",
            selectedColumnId: "input",
            jsonSelector: null,
          },
        ],
        sampling: 1,
        delay: 10_000,
        timeScope: ["NEW"],
        status: "INACTIVE",
      });

      expect(response.id).not.toEqual(sourceConfig.id);

      const clonedConfig = await prisma.jobConfiguration.findUnique({
        where: { id: response.id },
      });

      expect(clonedConfig).toMatchObject({
        projectId: project.id,
        evalTemplateId: evalTemplate.id,
        scoreName: "source-score (copy)",
        targetObject: EvalTargetObject.EVENT,
        status: "INACTIVE",
        timeScope: ["NEW"],
        delay: 10_000,
      });
    });
  });

  describe("evals.updateConfig", () => {
    it("updates experiment code evaluator configs without a matching observation", async () => {
      const { project, caller } = await prepare();
      runCodeEvalTestForJobConfigMock.mockResolvedValueOnce(null);

      const evalTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: `code-experiment-template-${project.id}`,
          version: 1,
          type: EvalTemplateType.CODE,
          prompt: null,
          outputDefinition: undefined,
          sourceCode:
            'function evaluate() { return { scores: [{ name: "experiment-score", value: 1 }] }; }',
          sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        },
      });

      const evalJobConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          evalTemplateId: evalTemplate.id,
          scoreName: "experiment-code-score",
          filter: [],
          targetObject: EvalTargetObject.EXPERIMENT,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          timeScope: ["NEW"],
        },
      });

      const response = await caller.evals.updateEvalJob({
        projectId: project.id,
        evalConfigId: evalJobConfig.id,
        config: {
          scoreName: "updated-experiment-code-score",
        },
      });

      expect(response.id).toEqual(evalJobConfig.id);
      expect(response.scoreName).toEqual("updated-experiment-code-score");
      expect(runCodeEvalTestForJobConfigMock).toHaveBeenCalledOnce();
    });

    it("should update an evaluator configuration", async () => {
      const { project, caller } = await prepare();

      const evalJobConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          timeScope: ["NEW"],
        },
      });

      const response = await caller.evals.updateEvalJob({
        projectId: project.id,
        evalConfigId: evalJobConfig.id,
        config: {
          status: "INACTIVE",
        },
      });

      expect(response.id).toEqual(evalJobConfig.id);
      expect(response.status).toEqual("INACTIVE");
      expect(response.timeScope).toEqual(["NEW"]);

      const updatedJob = await prisma.jobConfiguration.findUnique({
        where: {
          id: evalJobConfig.id,
        },
      });

      expect(updatedJob).not.toBeNull();
      expect(updatedJob?.id).toEqual(evalJobConfig.id);
      expect(updatedJob?.status).toEqual("INACTIVE");
      expect(updatedJob?.timeScope).toEqual(["NEW"]);
    });

    it("rejects observation-only variable mapping updates for trace evaluators", async () => {
      const { project, caller } = await prepare();

      const traceVariableMapping = [
        {
          templateVariable: "input",
          objectName: null,
          langfuseObject: "trace",
          selectedColumnId: "input",
          jsonSelector: null,
        },
      ];

      const evalJobConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: traceVariableMapping,
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          timeScope: ["NEW"],
        },
      });

      await expect(
        caller.evals.updateEvalJob({
          projectId: project.id,
          evalConfigId: evalJobConfig.id,
          config: {
            variableMapping: [
              {
                templateVariable: "input",
                selectedColumnId: "input",
                jsonSelector: null,
              },
            ],
          },
        }),
      ).rejects.toThrow("Variable mapping does not match evaluator target.");

      const unchangedJob = await prisma.jobConfiguration.findUnique({
        where: {
          id: evalJobConfig.id,
        },
      });

      expect(unchangedJob?.variableMapping).toEqual(traceVariableMapping);
    });

    it("rejects updates when an evaluator still has unsupported filters", async () => {
      const { project, caller } = await prepare();

      const evalJobConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [
            {
              type: "numberObject",
              column: "Scores (numeric)",
              key: "accuracy",
              operator: ">",
              value: 0.8,
            },
          ],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          timeScope: ["NEW"],
        },
      });

      await expect(
        caller.evals.updateEvalJob({
          projectId: project.id,
          evalConfigId: evalJobConfig.id,
          config: {
            status: "INACTIVE",
          },
        }),
      ).rejects.toThrow(
        'Filter column "Scores (numeric)" is not supported for target "trace".',
      );
    });

    it("allows updates once unsupported filters are removed", async () => {
      const { project, caller } = await prepare();

      const evalJobConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [
            {
              type: "numberObject",
              column: "Scores (numeric)",
              key: "accuracy",
              operator: ">",
              value: 0.8,
            },
          ],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          timeScope: ["NEW"],
        },
      });

      const response = await caller.evals.updateEvalJob({
        projectId: project.id,
        evalConfigId: evalJobConfig.id,
        config: {
          filter: [],
          status: "INACTIVE",
        },
      });

      expect(response.status).toBe("INACTIVE");
      expect(response.filter).toEqual([]);
    });

    it("when the evaluator ran on existing traces, time scope cannot be changed to NEW only", async () => {
      const { project, caller } = await prepare();

      const evalJobConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          timeScope: ["EXISTING"],
        },
      });

      expect(
        caller.evals.updateEvalJob({
          projectId: project.id,
          evalConfigId: evalJobConfig.id,
          config: {
            timeScope: ["NEW"],
          },
        }),
      ).rejects.toThrow(
        "The evaluator ran on existing traces already. This cannot be changed anymore.",
      );
    });

    it("when the evaluator ran on existing traces, it cannot be deactivated", async () => {
      const { project, caller } = await prepare();

      const evalJobConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          timeScope: ["EXISTING"],
        },
      });

      expect(
        caller.evals.updateEvalJob({
          projectId: project.id,
          evalConfigId: evalJobConfig.id,
          config: {
            status: "INACTIVE",
          },
        }),
      ).rejects.toThrow(
        "The evaluator is running on existing traces only and cannot be deactivated.",
      );
    });

    it("when the evaluator ran on existing traces, it can be deactivated if it should also run on new traces", async () => {
      const { project, caller } = await prepare();

      const evalJobConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          timeScope: ["EXISTING", "NEW"],
        },
      });

      const response = await caller.evals.updateEvalJob({
        projectId: project.id,
        evalConfigId: evalJobConfig.id,
        config: {
          status: "INACTIVE",
        },
      });

      expect(response.id).toEqual(evalJobConfig.id);
      expect(response.status).toEqual("INACTIVE");
      expect(response.timeScope).toEqual(["EXISTING", "NEW"]);

      const updatedJob = await prisma.jobConfiguration.findUnique({
        where: {
          id: evalJobConfig.id,
        },
      });

      expect(updatedJob).not.toBeNull();
      expect(updatedJob?.id).toEqual(evalJobConfig.id);
      expect(updatedJob?.status).toEqual("INACTIVE");
      expect(updatedJob?.timeScope).toEqual(["EXISTING", "NEW"]);
    });
  });

  describe("evals.deleteEvalJob", () => {
    it("should successfully delete an eval job", async () => {
      const { project, caller } = await prepare();

      // Create a job to delete
      const evalJobConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          timeScope: ["NEW"],
        },
      });

      // Create multiple job executions with different statuses
      await Promise.all([
        prisma.jobExecution.create({
          data: {
            jobConfigurationId: evalJobConfig.id,
            status: "COMPLETED",
            projectId: project.id,
          },
        }),
        prisma.jobExecution.create({
          data: {
            jobConfigurationId: evalJobConfig.id,
            status: "PENDING",
            projectId: project.id,
          },
        }),
        prisma.jobExecution.create({
          data: {
            jobConfigurationId: evalJobConfig.id,
            status: "ERROR",
            projectId: project.id,
            error: "Test error",
          },
        }),
      ]);

      // Verify job executions exist before deletion
      const beforeJobExecutions = await prisma.jobExecution.findMany({
        where: {
          jobConfigurationId: evalJobConfig.id,
        },
      });
      expect(beforeJobExecutions).toHaveLength(3);

      // Delete the job
      await caller.evals.deleteEvalJob({
        projectId: project.id,
        evalConfigId: evalJobConfig.id,
      });

      // Verify job is deleted
      const deletedJob = await prisma.jobConfiguration.findUnique({
        where: {
          id: evalJobConfig.id,
        },
      });
      expect(deletedJob).toBeNull();

      // Verify all job executions are deleted (cascade)
      const afterJobExecutions = await prisma.jobExecution.findMany({
        where: {
          jobConfigurationId: evalJobConfig.id,
        },
      });
      expect(afterJobExecutions).toHaveLength(0);
    });

    it("should throw error when trying to delete non-existent eval job", async () => {
      const { project, caller } = await prepare();

      await expect(
        caller.evals.deleteEvalJob({
          projectId: project.id,
          evalConfigId: "non-existent-id",
        }),
      ).rejects.toThrow("Job not found");
    });

    it("should throw error when user lacks evalJob:CUD access scope", async () => {
      const { project, session } = await prepare();

      // Create a session with limited permissions
      const limitedSession: Session = {
        ...session,
        user: {
          id: session.user!.id,
          name: session.user!.name,
          canCreateOrganizations: session.user!.canCreateOrganizations,
          admin: false,
          featureFlags: session.user!.featureFlags,
          organizations: [
            {
              ...session.user!.organizations[0],
              role: "MEMBER",
              projects: [
                {
                  ...session.user!.organizations[0].projects[0],
                  role: "VIEWER", // VIEWER role doesn't have evalTemplate:CUD scope
                },
              ],
            },
          ],
        },
        expires: session.expires,
        environment: session.environment,
      };
      const limitedCtx = createInnerTRPCContext({ session: limitedSession });
      const limitedCaller = appRouter.createCaller({ ...limitedCtx, prisma });

      // Create a job
      const evalJobConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          timeScope: ["NEW"],
        },
      });

      // Attempt to delete with limited permissions
      await expect(
        limitedCaller.evals.deleteEvalJob({
          projectId: project.id,
          evalConfigId: evalJobConfig.id,
        }),
      ).rejects.toThrow("User does not have access to this resource or action");
    });
  });

  // TODO: moved to LFE-4573
  // describe("evals.deleteEvalTemplate", () => {
  //   it("should successfully delete an eval template", async () => {
  //     const { project, caller } = await prepare();

  //     // Create a template to delete
  //     const evalTemplate = await prisma.evalTemplate.create({
  //       data: {
  //         projectId: project.id,
  //         name: "test-template",
  //         version: 1,
  //         prompt: "test prompt",
  //         model: "test-model",
  //         modelParams: {},
  //         vars: [],
  //         outputDefinition: {
  //           score: "test-score",
  //           reasoning: "test-reasoning",
  //         },
  //         provider: "test-provider",
  //       },
  //     });

  //     // Delete the template
  //     await caller.evals.deleteEvalTemplate({
  //       projectId: project.id,
  //       evalTemplateId: evalTemplate.id,
  //     });

  //     // Verify template is deleted
  //     const deletedTemplate = await prisma.evalTemplate.findUnique({
  //       where: {
  //         id: evalTemplate.id,
  //       },
  //     });
  //     expect(deletedTemplate).toBeNull();
  //   });

  //   it("should set evalTemplateId to null for associated eval jobs when template is deleted", async () => {
  //     const { project, caller } = await prepare();

  //     // Create a template
  //     const evalTemplate = await prisma.evalTemplate.create({
  //       data: {
  //         projectId: project.id,
  //         name: "test-template",
  //         version: 1,
  //         prompt: "test prompt",
  //         model: "test-model",
  //         modelParams: {},
  //         vars: [],
  //         outputDefinition: {
  //           score: "test-score",
  //           reasoning: "test-reasoning",
  //         },
  //         provider: "test-provider",
  //       },
  //     });

  //     // Create an eval job linked to this template
  //     const evalJob = await prisma.jobConfiguration.create({
  //       data: {
  //         projectId: project.id,
  //         jobType: "EVAL",
  //         scoreName: "test-score",
  //         filter: [],
  //         targetObject: EvalTargetObject.TRACE,
  //         variableMapping: [],
  //         sampling: 1,
  //         delay: 0,
  //         status: "ACTIVE",
  //         timeScope: ["NEW"],
  //         evalTemplateId: evalTemplate.id,
  //       },
  //     });

  //     // Delete the template
  //     await caller.evals.deleteEvalTemplate({
  //       projectId: project.id,
  //       evalTemplateId: evalTemplate.id,
  //     });

  //     // Verify template is deleted
  //     const deletedTemplate = await prisma.evalTemplate.findUnique({
  //       where: {
  //         id: evalTemplate.id,
  //       },
  //     });
  //     expect(deletedTemplate).toBeNull();

  //     // Verify eval job still exists but has evalTemplateId set to null
  //     const updatedJob = await prisma.jobConfiguration.findUnique({
  //       where: {
  //         id: evalJob.id,
  //       },
  //     });
  //     expect(updatedJob).not.toBeNull();
  //     expect(updatedJob?.evalTemplateId).toBeNull();
  //   });

  //   it("should throw error when trying to delete non-existent eval template", async () => {
  //     const { project, caller } = await prepare();

  //     await expect(
  //       caller.evals.deleteEvalTemplate({
  //         projectId: project.id,
  //         evalTemplateId: "non-existent-id",
  //       }),
  //     ).rejects.toThrow("Template not found");
  //   });

  //   it("should throw error when user lacks evalTemplate:CUD access scope", async () => {
  //     const { project, session } = await prepare();

  //     // Create a session with limited permissions
  //     const limitedSession: Session = {
  //       ...session,
  //       user: {
  //         id: session.user!.id,
  //         name: session.user!.name,
  //         canCreateOrganizations: session.user!.canCreateOrganizations,
  //         admin: false,
  //         featureFlags: session.user!.featureFlags,
  //         organizations: [
  //           {
  //             ...session.user!.organizations[0],
  //             role: "MEMBER",
  //             projects: [
  //               {
  //                 ...session.user!.organizations[0].projects[0],
  //                 role: "VIEWER", // VIEWER role doesn't have evalTemplate:CUD scope
  //               },
  //             ],
  //           },
  //         ],
  //       },
  //       expires: session.expires,
  //       environment: session.environment,
  //     };
  //     const limitedCtx = createInnerTRPCContext({ session: limitedSession });
  //     const limitedCaller = appRouter.createCaller({ ...limitedCtx, prisma });

  //     // Create a template
  //     const evalTemplate = await prisma.evalTemplate.create({
  //       data: {
  //         projectId: project.id,
  //         name: "test-template",
  //         version: 1,
  //         prompt: "test prompt",
  //         model: "test-model",
  //         modelParams: {},
  //         vars: [],
  //         outputDefinition: {
  //           score: "test-score",
  //           reasoning: "test-reasoning",
  //         },
  //         provider: "test-provider",
  //       },
  //     });

  //     // Attempt to delete with limited permissions
  //     await expect(
  //       limitedCaller.evals.deleteEvalTemplate({
  //         projectId: project.id,
  //         evalTemplateId: evalTemplate.id,
  //       }),
  //     ).rejects.toThrow("User does not have access to this resource or action");
  //   });
  // });
});
