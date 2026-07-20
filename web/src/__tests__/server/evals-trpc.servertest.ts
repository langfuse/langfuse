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
import { CODE_EVAL_TEMPLATE_VARIABLES } from "@/src/features/evals/utils/code-eval-template-utils";
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

describe("evalsV2.activateRule", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: __orgIds } },
    });
  });

  it("activates an evaluator with the filters saved during setup", async () => {
    const { project, caller } = await prepare();
    const evaluator = await prisma.jobConfiguration.create({
      data: {
        projectId: project.id,
        jobType: "EVAL",
        scoreName: "setup-scope-evaluator",
        filter: [],
        targetObject: EvalTargetObject.EVENT,
        variableMapping: [],
        sampling: 0.5,
        delay: 30_000,
        status: "INACTIVE",
      },
    });

    const result = await caller.evalsV2.activateRule({
      projectId: project.id,
      evaluatorId: evaluator.id,
      scope: { mode: "setup" },
    });

    const updated = await prisma.jobConfiguration.findUniqueOrThrow({
      where: { id: evaluator.id, projectId: project.id },
      include: { runScopeAssignments: true },
    });
    const createdScope = await prisma.evalRunScope.findUniqueOrThrow({
      where: { id: result.runScopeId, projectId: project.id },
    });

    expect(updated.status).toBe("ACTIVE");
    expect(updated.runScopeAssignments).toEqual([
      expect.objectContaining({ runScopeId: createdScope.id }),
    ]);
    expect(updated.timeScope).toEqual(["NEW"]);
    expect(createdScope.filter).toEqual([]);
    expect(createdScope.sampling.toNumber()).toBe(0.5);
    expect(createdScope.createdByUserId).toBe("user-1");
  });

  it("activates an evaluator with one existing scope", async () => {
    const { project, caller } = await prepare();
    const evaluator = await prisma.jobConfiguration.create({
      data: {
        projectId: project.id,
        jobType: "EVAL",
        scoreName: "existing-scope-evaluator",
        filter: [],
        targetObject: EvalTargetObject.EVENT,
        variableMapping: [],
        sampling: 1,
        delay: 30_000,
        status: "INACTIVE",
      },
    });
    const scope = await prisma.evalRunScope.create({
      data: {
        projectId: project.id,
        name: `existing-scope-${evaluator.id}`,
        targetObject: EvalTargetObject.EVENT,
        filter: [],
        sampling: 0.25,
        delay: 10_000,
      },
    });

    await caller.evalsV2.activateRule({
      projectId: project.id,
      evaluatorId: evaluator.id,
      scope: { mode: "existing", runScopeId: scope.id },
    });

    const updated = await prisma.jobConfiguration.findUniqueOrThrow({
      where: { id: evaluator.id, projectId: project.id },
      include: { runScopeAssignments: true },
    });
    expect(updated.status).toBe("ACTIVE");
    expect(updated.runScopeAssignments).toEqual([
      expect.objectContaining({ runScopeId: scope.id }),
    ]);
    expect(updated.sampling.toNumber()).toBe(0.25);
    expect(updated.delay).toBe(10_000);
  });

  it("does not attach a scope from another project", async () => {
    const { project, caller } = await prepare();
    const { project: otherProject } = await prepare();
    const evaluator = await prisma.jobConfiguration.create({
      data: {
        projectId: project.id,
        jobType: "EVAL",
        scoreName: "project-isolated-evaluator",
        filter: [],
        targetObject: EvalTargetObject.EVENT,
        variableMapping: [],
        sampling: 1,
        delay: 30_000,
        status: "INACTIVE",
      },
    });
    const otherScope = await prisma.evalRunScope.create({
      data: {
        projectId: otherProject.id,
        name: `other-project-scope-${evaluator.id}`,
        targetObject: EvalTargetObject.EVENT,
        filter: [],
        sampling: 1,
        delay: 30_000,
      },
    });

    await expect(
      caller.evalsV2.activateRule({
        projectId: project.id,
        evaluatorId: evaluator.id,
        scope: { mode: "existing", runScopeId: otherScope.id },
      }),
    ).rejects.toThrow("Run scope not found");

    const unchanged = await prisma.jobConfiguration.findUniqueOrThrow({
      where: { id: evaluator.id, projectId: project.id },
      include: { runScopeAssignments: true },
    });
    expect(unchanged.status).toBe("INACTIVE");
    expect(unchanged.runScopeAssignments).toEqual([]);
  });

  it("attaches one evaluator to multiple run scopes", async () => {
    const { project, caller } = await prepare();
    const evaluator = await prisma.jobConfiguration.create({
      data: {
        projectId: project.id,
        jobType: "EVAL",
        scoreName: "multi-scope-evaluator",
        filter: [],
        targetObject: EvalTargetObject.EVENT,
        variableMapping: [],
        sampling: 1,
        delay: 30_000,
        status: "INACTIVE",
      },
    });
    const scopes = await Promise.all(
      ["production", "staging"].map((name) =>
        prisma.evalRunScope.create({
          data: {
            projectId: project.id,
            name: `${name}-${evaluator.id}`,
            targetObject: EvalTargetObject.EVENT,
            filter: [],
            sampling: 1,
          },
        }),
      ),
    );

    for (const scope of scopes) {
      await caller.evalsV2.attachEvaluatorToRunScope({
        projectId: project.id,
        evaluatorId: evaluator.id,
        runScopeId: scope.id,
      });
    }

    const assignments = await prisma.evalRunScopeAssignment.findMany({
      where: { jobConfigurationId: evaluator.id },
      orderBy: { runScopeId: "asc" },
    });
    expect(
      assignments.map((assignment) => assignment.runScopeId).sort(),
    ).toEqual(scopes.map((scope) => scope.id).sort());
  });

  it("rejects a cross-project run-scope attachment", async () => {
    const { project, caller } = await prepare();
    const { project: otherProject } = await prepare();
    const evaluator = await prisma.jobConfiguration.create({
      data: {
        projectId: project.id,
        jobType: "EVAL",
        scoreName: "tenant-isolated-evaluator",
        filter: [],
        targetObject: EvalTargetObject.EVENT,
        variableMapping: [],
        sampling: 1,
        delay: 30_000,
      },
    });
    const otherScope = await prisma.evalRunScope.create({
      data: {
        projectId: otherProject.id,
        name: `tenant-isolated-scope-${evaluator.id}`,
        targetObject: EvalTargetObject.EVENT,
        filter: [],
        sampling: 1,
      },
    });

    await expect(
      caller.evalsV2.attachEvaluatorToRunScope({
        projectId: project.id,
        evaluatorId: evaluator.id,
        runScopeId: otherScope.id,
      }),
    ).rejects.toThrow("Run scope not found");

    await expect(
      prisma.evalRunScopeAssignment.findUnique({
        where: {
          jobConfigurationId_runScopeId: {
            jobConfigurationId: evaluator.id,
            runScopeId: otherScope.id,
          },
        },
      }),
    ).resolves.toBeNull();
  });

  it("creates a definition version and updates mappings when editing", async () => {
    const { project, caller } = await prepare();
    const template = await prisma.evalTemplate.create({
      data: {
        projectId: project.id,
        name: "versioned-evaluator",
        version: 1,
        type: "LLM_AS_JUDGE",
        prompt: "Judge {{input}}",
        vars: ["input"],
        outputDefinition: createNumericEvalOutputDefinition({
          reasoningDescription: "Why",
          scoreDescription: "Score",
        }),
      },
    });
    const evaluator = await prisma.jobConfiguration.create({
      data: {
        projectId: project.id,
        jobType: "EVAL",
        evalTemplateId: template.id,
        scoreName: "versioned-evaluator",
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
        delay: 30_000,
      },
    });

    await caller.evalsV2.updateEvaluatorDefinition({
      projectId: project.id,
      evaluatorId: evaluator.id,
      scoreName: "versioned-evaluator",
      description: "Updated definition",
      prompt: "Judge {{output}} carefully",
      sourceCode: null,
      sourceCodeLanguage: null,
      mapping: [
        {
          templateVariable: "output",
          selectedColumnId: "output",
          jsonSelector: null,
        },
      ],
    });

    const updated = await prisma.jobConfiguration.findUniqueOrThrow({
      where: { id: evaluator.id, projectId: project.id },
      include: { evalTemplate: true },
    });
    const original = await prisma.evalTemplate.findUniqueOrThrow({
      where: { id: template.id },
    });

    expect(updated.evalTemplate).toEqual(
      expect.objectContaining({
        version: 2,
        prompt: "Judge {{output}} carefully",
        vars: ["output"],
      }),
    );
    expect(updated.evalTemplateId).not.toBe(template.id);
    expect(updated.variableMapping).toEqual([
      {
        templateVariable: "output",
        selectedColumnId: "output",
        jsonSelector: null,
      },
    ]);
    expect(updated.description).toBe("Updated definition");
    expect(original.prompt).toBe("Judge {{input}}");
  });

  it("rejects editing an evaluator from another project", async () => {
    const { project, caller } = await prepare();
    const { project: otherProject } = await prepare();
    const template = await prisma.evalTemplate.create({
      data: {
        projectId: otherProject.id,
        name: "other-project-definition",
        version: 1,
        type: "LLM_AS_JUDGE",
        prompt: "Original prompt",
        vars: [],
      },
    });
    const evaluator = await prisma.jobConfiguration.create({
      data: {
        projectId: otherProject.id,
        jobType: "EVAL",
        evalTemplateId: template.id,
        scoreName: "other-project-definition",
        filter: [],
        targetObject: EvalTargetObject.EVENT,
        variableMapping: [],
        sampling: 1,
        delay: 30_000,
      },
    });

    await expect(
      caller.evalsV2.updateEvaluatorDefinition({
        projectId: project.id,
        evaluatorId: evaluator.id,
        scoreName: "stolen-evaluator",
        description: null,
        prompt: "Changed prompt",
        sourceCode: null,
        sourceCodeLanguage: null,
        mapping: [],
      }),
    ).rejects.toThrow("Evaluator not found");

    const unchanged = await prisma.jobConfiguration.findUniqueOrThrow({
      where: { id: evaluator.id, projectId: otherProject.id },
      include: { evalTemplate: true },
    });
    expect(unchanged.scoreName).toBe("other-project-definition");
    expect(unchanged.evalTemplate?.prompt).toBe("Original prompt");
  });

  it("updates a run scope including its name", async () => {
    const { project, caller } = await prepare();
    const scope = await prisma.evalRunScope.create({
      data: {
        projectId: project.id,
        name: `scope-before-edit-${project.id}`,
        targetObject: EvalTargetObject.EVENT,
        filter: [],
        sampling: 1,
      },
    });

    await caller.evalsV2.updateRunScope({
      projectId: project.id,
      runScopeId: scope.id,
      name: `scope-after-edit-${project.id}`,
      filter: [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
      ],
      sampling: 0.25,
    });

    const updated = await prisma.evalRunScope.findUniqueOrThrow({
      where: { id: scope.id, projectId: project.id },
    });
    expect(updated.name).toBe(`scope-after-edit-${project.id}`);
    expect(updated.filter).toEqual([
      expect.objectContaining({ column: "environment", value: ["production"] }),
    ]);
    expect(updated.sampling.toNumber()).toBe(0.25);
  });

  it("deletes a run scope and inactivates evaluators left without a scope", async () => {
    const { project, caller } = await prepare();
    const evaluator = await prisma.jobConfiguration.create({
      data: {
        projectId: project.id,
        jobType: "EVAL",
        scoreName: "scope-delete-evaluator",
        filter: [],
        targetObject: EvalTargetObject.EVENT,
        variableMapping: [],
        sampling: 1,
        delay: 30_000,
        status: "ACTIVE",
      },
    });
    const scope = await prisma.evalRunScope.create({
      data: {
        projectId: project.id,
        name: `scope-to-delete-${project.id}`,
        targetObject: EvalTargetObject.EVENT,
        filter: [],
        sampling: 1,
        evaluatorAssignments: {
          create: { jobConfigurationId: evaluator.id },
        },
      },
    });

    await caller.evalsV2.deleteRunScope({
      projectId: project.id,
      runScopeId: scope.id,
    });

    await expect(
      prisma.evalRunScope.findUnique({ where: { id: scope.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.jobConfiguration.findUniqueOrThrow({
        where: { id: evaluator.id },
      }),
    ).resolves.toEqual(expect.objectContaining({ status: "INACTIVE" }));
  });

  it("keeps evaluators active when deleting one of their run scopes", async () => {
    const { project, caller } = await prepare();
    const evaluator = await prisma.jobConfiguration.create({
      data: {
        projectId: project.id,
        jobType: "EVAL",
        scoreName: "multi-scope-delete-evaluator",
        filter: [],
        targetObject: EvalTargetObject.EVENT,
        variableMapping: [],
        sampling: 1,
        delay: 30_000,
        status: "ACTIVE",
      },
    });
    const scopes = await Promise.all(
      ["delete", "keep"].map((name) =>
        prisma.evalRunScope.create({
          data: {
            projectId: project.id,
            name: `${name}-scope-${project.id}`,
            targetObject: EvalTargetObject.EVENT,
            filter: [],
            sampling: 1,
            evaluatorAssignments: {
              create: { jobConfigurationId: evaluator.id },
            },
          },
        }),
      ),
    );

    await caller.evalsV2.deleteRunScope({
      projectId: project.id,
      runScopeId: scopes[0].id,
    });

    const updated = await prisma.jobConfiguration.findUniqueOrThrow({
      where: { id: evaluator.id },
      include: { runScopeAssignments: true },
    });
    expect(updated.status).toBe("ACTIVE");
    expect(updated.runScopeAssignments).toEqual([
      expect.objectContaining({ runScopeId: scopes[1].id }),
    ]);
  });

  it("does not delete a run scope from another project", async () => {
    const { project, caller } = await prepare();
    const { project: otherProject } = await prepare();
    const scope = await prisma.evalRunScope.create({
      data: {
        projectId: otherProject.id,
        name: `other-project-scope-${otherProject.id}`,
        targetObject: EvalTargetObject.EVENT,
        filter: [],
        sampling: 1,
      },
    });

    await expect(
      caller.evalsV2.deleteRunScope({
        projectId: project.id,
        runScopeId: scope.id,
      }),
    ).rejects.toThrow("Run scope not found");

    await expect(
      prisma.evalRunScope.findUnique({ where: { id: scope.id } }),
    ).resolves.not.toBeNull();
  });

  it("creates and returns run-scope creator metadata", async () => {
    const { project, caller, session } = await prepare();

    const created = await caller.evalsV2.createRunScope({
      projectId: project.id,
      name: `created-scope-${project.id}`,
      targetObject: EvalTargetObject.EVENT,
      filter: [],
      sampling: 1,
    });

    const persisted = await prisma.evalRunScope.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(persisted.createdByUserId).toBe(session.user.id);

    const scopes = await caller.evalsV2.runScopes({ projectId: project.id });
    expect(scopes).toContainEqual(
      expect.objectContaining({
        id: created.id,
        createdAt: persisted.createdAt,
        updatedAt: persisted.updatedAt,
        createdByUser: expect.objectContaining({ name: "Demo User" }),
      }),
    );
  });

  it("returns evaluator overview metadata and run-scope usage", async () => {
    const { project, caller } = await prepare();
    const creator = await prisma.user.create({
      data: {
        id: `evaluator-creator-${project.id}`,
        name: "Evaluation Owner",
        email: `evaluator-owner-${project.id}@example.com`,
      },
    });
    const template = await prisma.evalTemplate.create({
      data: {
        projectId: project.id,
        name: `overview-template-${project.id}`,
        version: 1,
        type: "CODE",
        sourceCode: "return { scores: [] };",
        sourceCodeLanguage: "TYPESCRIPT",
      },
    });
    const evaluator = await prisma.jobConfiguration.create({
      data: {
        projectId: project.id,
        createdByUserId: creator.id,
        jobType: "EVAL",
        evalTemplateId: template.id,
        scoreName: "overview-evaluator",
        filter: [],
        targetObject: EvalTargetObject.EVENT,
        variableMapping: [],
        sampling: 1,
        delay: 0,
      },
    });
    await prisma.evalRunScope.create({
      data: {
        projectId: project.id,
        name: `overview-scope-${project.id}`,
        targetObject: EvalTargetObject.EVENT,
        filter: [],
        sampling: 1,
        evaluatorAssignments: {
          create: { jobConfigurationId: evaluator.id },
        },
      },
    });

    const overview = await caller.evalsV2.evaluators({
      projectId: project.id,
    });

    expect(overview).toContainEqual(
      expect.objectContaining({
        id: evaluator.id,
        scoreName: "overview-evaluator",
        usedByCount: 1,
        createdByUser: expect.objectContaining({ name: "Evaluation Owner" }),
        evalTemplate: { type: "CODE" },
      }),
    );

    await prisma.user.delete({ where: { id: creator.id } });
  });

  it("returns the latest five executions for each run scope", async () => {
    const { project, caller } = await prepare();
    const evaluator = await prisma.jobConfiguration.create({
      data: {
        projectId: project.id,
        jobType: "EVAL",
        scoreName: "execution-history-evaluator",
        filter: [],
        targetObject: EvalTargetObject.EVENT,
        variableMapping: [],
        sampling: 1,
        delay: 0,
      },
    });
    const scope = await prisma.evalRunScope.create({
      data: {
        projectId: project.id,
        name: `execution-history-scope-${project.id}`,
        targetObject: EvalTargetObject.EVENT,
        filter: [],
        sampling: 1,
        evaluatorAssignments: {
          create: { jobConfigurationId: evaluator.id },
        },
      },
    });
    await prisma.jobExecution.createMany({
      data: Array.from({ length: 6 }, (_, index) => ({
        id: `execution-${project.id}-${index}`,
        projectId: project.id,
        jobConfigurationId: evaluator.id,
        runScopeId: scope.id,
        status: index === 5 ? ("ERROR" as const) : ("COMPLETED" as const),
        createdAt: new Date(`2026-07-20T10:0${index}:00.000Z`),
      })),
    });

    const scopes = await caller.evalsV2.runScopes({ projectId: project.id });
    const result = scopes.find((item) => item.id === scope.id);

    expect(result?.jobExecutions).toHaveLength(5);
    expect(result?.jobExecutions[0]).toEqual(
      expect.objectContaining({
        id: `execution-${project.id}-5`,
        status: "ERROR",
      }),
    );
    expect(result?.jobExecutions.at(-1)?.id).toBe(`execution-${project.id}-1`);
  });

  it("toggles only run scopes belonging to the current project", async () => {
    const { project, caller } = await prepare();
    const { project: otherProject } = await prepare();
    const ownScope = await prisma.evalRunScope.create({
      data: {
        projectId: project.id,
        name: `toggle-scope-${project.id}`,
        targetObject: EvalTargetObject.EVENT,
        filter: [],
        sampling: 1,
      },
    });
    const otherScope = await prisma.evalRunScope.create({
      data: {
        projectId: otherProject.id,
        name: `toggle-scope-${otherProject.id}`,
        targetObject: EvalTargetObject.EVENT,
        filter: [],
        sampling: 1,
      },
    });

    await expect(
      caller.evalsV2.setRunScopesEnabled({
        projectId: project.id,
        runScopeIds: [ownScope.id, otherScope.id],
        enabled: false,
      }),
    ).rejects.toThrow("One or more run scopes were not found");
    await expect(
      prisma.evalRunScope.findUniqueOrThrow({ where: { id: ownScope.id } }),
    ).resolves.toEqual(expect.objectContaining({ enabled: true }));

    await caller.evalsV2.setRunScopesEnabled({
      projectId: project.id,
      runScopeIds: [ownScope.id],
      enabled: false,
    });

    await expect(
      prisma.evalRunScope.findUniqueOrThrow({ where: { id: ownScope.id } }),
    ).resolves.toEqual(expect.objectContaining({ enabled: false }));
    await expect(
      prisma.evalRunScope.findUniqueOrThrow({ where: { id: otherScope.id } }),
    ).resolves.toEqual(expect.objectContaining({ enabled: true }));
  });

  it("bulk deletes only evaluators belonging to the current project", async () => {
    const { project, caller } = await prepare();
    const { project: otherProject } = await prepare();
    const createEvaluator = (projectId: string, scoreName: string) =>
      prisma.jobConfiguration.create({
        data: {
          projectId,
          jobType: "EVAL",
          scoreName,
          filter: [],
          targetObject: EvalTargetObject.EVENT,
          variableMapping: [],
          sampling: 1,
          delay: 0,
        },
      });
    const ownEvaluator = await createEvaluator(
      project.id,
      "bulk-delete-own-evaluator",
    );
    const otherEvaluator = await createEvaluator(
      otherProject.id,
      "bulk-delete-other-evaluator",
    );

    await expect(
      caller.evalsV2.deleteEvaluators({
        projectId: project.id,
        evaluatorIds: [ownEvaluator.id, otherEvaluator.id],
      }),
    ).rejects.toThrow("One or more evaluators were not found");
    await expect(
      prisma.jobConfiguration.findUnique({ where: { id: ownEvaluator.id } }),
    ).resolves.not.toBeNull();

    await caller.evalsV2.deleteEvaluators({
      projectId: project.id,
      evaluatorIds: [ownEvaluator.id],
    });

    await expect(
      prisma.jobConfiguration.findUnique({ where: { id: ownEvaluator.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.jobConfiguration.findUnique({ where: { id: otherEvaluator.id } }),
    ).resolves.not.toBeNull();
  });
});

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

  describe("evals.latestTemplates", () => {
    it("should return only the latest template per project/name/type family", async () => {
      const { project, caller } = await prepare();

      const staleLlmTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: `latest-family-template-${project.id}`,
          version: 1,
          prompt: "Score this response",
          outputDefinition: createNumericEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription: "How good",
          }),
        },
      });

      const latestLlmTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: staleLlmTemplate.name,
          version: 2,
          prompt: "Score this response again",
          outputDefinition: createNumericEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription: "How good",
          }),
        },
      });

      const codeTemplateWithSameName = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: staleLlmTemplate.name,
          version: 3,
          type: EvalTemplateType.CODE,
          prompt: null,
          outputDefinition: undefined,
          sourceCode:
            'function evaluate() { return { scores: [{ name: "code-score", value: 1 }] }; }',
          sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        },
      });

      const response = await caller.evals.latestTemplates({
        projectId: project.id,
      });
      const returnedIds = response.templates.map((template) => template.id);

      expect(returnedIds).toContain(latestLlmTemplate.id);
      expect(returnedIds).toContain(codeTemplateWithSameName.id);
      expect(returnedIds).not.toContain(staleLlmTemplate.id);
    });
  });

  describe("evals.createTemplate", () => {
    it("rejects new evaluators when the project already has the same template name", async () => {
      const { project, caller } = await prepare();
      const existingTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: `taken-template-name-${project.id}`,
          version: 1,
          prompt: "Score this response",
          outputDefinition: createNumericEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription: "How good",
          }),
        },
      });

      await expect(
        caller.evals.createTemplate({
          projectId: project.id,
          name: existingTemplate.name,
          intent: "new",
          type: EvalTemplateType.CODE,
          sourceCode:
            'function evaluate() { return { scores: [{ name: "code-score", value: 1 }] }; }',
          sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        }),
      ).rejects.toThrow(
        // the existing template is LLM_AS_JUDGE while the attempt is CODE
        `An evaluator named "${existingTemplate.name}" already exists in this project with a different type. Use a different name.`,
      );

      await expect(
        prisma.evalTemplate.findMany({
          where: {
            projectId: project.id,
            name: existingTemplate.name,
          },
          select: { id: true },
        }),
      ).resolves.toEqual([{ id: existingTemplate.id }]);
    });

    it("rejects Python code evaluators for the insecure-local dispatcher", async () => {
      const { project, caller } = await prepare();

      await expect(
        caller.evals.createTemplate({
          projectId: project.id,
          name: `python-code-template-${project.id}`,
          intent: "new",
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
    it("keeps evaluator configs on latest template versions", async () => {
      const { project, caller } = await prepare();
      runCodeEvalTestForJobConfigMock.mockResolvedValue(null);
      const mapping = CODE_EVAL_TEMPLATE_VARIABLES.map((templateVariable) => ({
        templateVariable,
        selectedColumnId: templateVariable,
        jsonSelector: null,
      }));

      const staleTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: `code-versioning-template-${project.id}`,
          version: 1,
          type: EvalTemplateType.CODE,
          prompt: null,
          outputDefinition: undefined,
          sourceCode:
            'function evaluate() { return { scores: [{ name: "versioning-score", value: 1 }] }; }',
          sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        },
      });
      const latestTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: staleTemplate.name,
          version: 2,
          type: EvalTemplateType.CODE,
          prompt: null,
          outputDefinition: undefined,
          sourceCode:
            'function evaluate() { return { scores: [{ name: "versioning-score", value: 2 }] }; }',
          sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        },
      });

      const createdFromStaleId = await caller.evals.createJob({
        projectId: project.id,
        evalTemplateId: staleTemplate.id,
        scoreName: "stale-template-score",
        target: EvalTargetObject.EXPERIMENT,
        filter: [],
        mapping,
        sampling: 1,
        delay: 0,
        timeScope: ["NEW"],
      });

      await expect(
        prisma.jobConfiguration.findUnique({
          where: { id: createdFromStaleId.id },
          select: { evalTemplateId: true },
        }),
      ).resolves.toEqual({ evalTemplateId: latestTemplate.id });

      const configToRetarget = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          evalTemplateId: staleTemplate.id,
          scoreName: "retargeted-template-score",
          filter: [],
          targetObject: EvalTargetObject.EXPERIMENT,
          variableMapping: mapping,
          sampling: 1,
          delay: 0,
          status: "INACTIVE",
          timeScope: ["NEW"],
        },
      });

      const newVersion = await caller.evals.createTemplate({
        projectId: project.id,
        name: staleTemplate.name,
        intent: "new-version",
        sourceTemplateId: staleTemplate.id,
        type: EvalTemplateType.CODE,
        sourceCode:
          'function evaluate() { return { scores: [{ name: "versioning-score", value: 3 }] }; }',
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
      });

      expect(newVersion.updatedConfigCount).toBe(2);
      expect(newVersion.template.version).toBe(3);
      await expect(
        prisma.jobConfiguration.findUnique({
          where: { id: configToRetarget.id },
          select: { evalTemplateId: true, variableMapping: true },
        }),
      ).resolves.toEqual({
        evalTemplateId: newVersion.template.id,
        variableMapping: mapping,
      });
    });

    it("rejects stale template resolution when the latest version needs new variable mappings", async () => {
      const { project, caller } = await prepare();

      const staleTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: `llm-versioning-template-${project.id}`,
          version: 1,
          prompt: "Score {{query}}",
          vars: ["query"],
          outputDefinition: createNumericEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription: "How good",
          }),
        },
      });
      const latestTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: staleTemplate.name,
          version: 2,
          prompt: "Score {{query}} with {{context}}",
          vars: ["query", "context"],
          outputDefinition: createNumericEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription: "How good",
          }),
        },
      });

      await expect(
        caller.evals.createJob({
          projectId: project.id,
          evalTemplateId: staleTemplate.id,
          scoreName: "stale-template-missing-mapping-score",
          target: EvalTargetObject.EXPERIMENT,
          filter: [],
          mapping: [
            {
              templateVariable: "query",
              selectedColumnId: "query",
              jsonSelector: null,
            },
          ],
          sampling: 1,
          delay: 0,
          timeScope: ["NEW"],
        }),
      ).rejects.toThrow(
        `Evaluator template "${staleTemplate.name}" changed while this form was open`,
      );

      await expect(
        prisma.jobConfiguration.findFirst({
          where: {
            projectId: project.id,
            scoreName: "stale-template-missing-mapping-score",
            evalTemplateId: latestTemplate.id,
          },
        }),
      ).resolves.toBeNull();
    });

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
      ).rejects.toThrow(
        "Evaluator failed when tested against sample data: Evaluator failed during test run",
      );

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
  });

  describe("evals.updateAllDatasetEvalJobStatusByTemplateId", () => {
    it("toggles experiment-target evaluator configs for the dataset", async () => {
      const { project, caller } = await prepare();
      const datasetId = `dataset-${project.id}`;
      const otherDatasetId = `other-dataset-${project.id}`;
      // CODE template so the reactivation preflight passes without an LLM connection
      const template = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: `toggle-template-${project.id}`,
          version: 1,
          type: EvalTemplateType.CODE,
          prompt: null,
          outputDefinition: undefined,
          sourceCode:
            'function evaluate() { return { scores: [{ name: "toggle-score", value: 1 }] }; }',
          sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        },
      });
      const experimentDatasetFilter = (id: string) => [
        {
          type: "stringOptions",
          value: [id],
          column: "experimentDatasetId",
          operator: "any of",
        },
      ];
      const experimentConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          evalTemplateId: template.id,
          scoreName: "experiment-toggle-score",
          filter: experimentDatasetFilter(datasetId),
          targetObject: EvalTargetObject.EXPERIMENT,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
        },
      });
      const otherDatasetConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          evalTemplateId: template.id,
          scoreName: "other-dataset-score",
          filter: experimentDatasetFilter(otherDatasetId),
          targetObject: EvalTargetObject.EXPERIMENT,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
        },
      });

      await caller.evals.updateAllDatasetEvalJobStatusByTemplateId({
        projectId: project.id,
        evalTemplateId: template.id,
        datasetId,
        newStatus: "INACTIVE",
      });

      await expect(
        prisma.jobConfiguration.findUniqueOrThrow({
          where: { id: experimentConfig.id },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: "INACTIVE" });
      await expect(
        prisma.jobConfiguration.findUniqueOrThrow({
          where: { id: otherDatasetConfig.id },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: "ACTIVE" });

      await caller.evals.updateAllDatasetEvalJobStatusByTemplateId({
        projectId: project.id,
        evalTemplateId: template.id,
        datasetId,
        newStatus: "ACTIVE",
      });

      await expect(
        prisma.jobConfiguration.findUniqueOrThrow({
          where: { id: experimentConfig.id },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: "ACTIVE" });
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

  const createTemplateVersion = (
    projectId: string | null,
    name: string,
    version: number,
  ) =>
    prisma.evalTemplate.create({
      data: {
        projectId,
        name,
        version,
        prompt: "test prompt",
        outputDefinition: createNumericEvalOutputDefinition({
          reasoningDescription: "Why",
          scoreDescription: "How good",
        }),
      },
    });

  describe("evals.evalTemplateUsage", () => {
    it("should return running evaluators referencing any version of the family", async () => {
      const { project, caller } = await prepare();

      const v1 = await createTemplateVersion(project.id, "usage-template", 1);
      const v2 = await createTemplateVersion(project.id, "usage-template", 2);

      const config = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          evalTemplateId: v1.id,
          scoreName: "usage-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          timeScope: ["NEW"],
        },
      });

      // queried via the latest version while the config references the old one
      const usage = await caller.evals.evalTemplateUsage({
        projectId: project.id,
        evalTemplateId: v2.id,
      });

      expect(usage).toEqual([{ id: config.id, scoreName: "usage-score" }]);
    });

    it("should return an empty list for unused evaluators", async () => {
      const { project, caller } = await prepare();

      const template = await createTemplateVersion(
        project.id,
        "unused-template",
        1,
      );

      const usage = await caller.evals.evalTemplateUsage({
        projectId: project.id,
        evalTemplateId: template.id,
      });

      expect(usage).toEqual([]);
    });

    it("should not expose evaluators of another project", async () => {
      const { project, caller } = await prepare();
      const { project: otherProject } = await prepare();

      const otherProjectTemplate = await createTemplateVersion(
        otherProject.id,
        "other-project-usage-template",
        1,
      );

      await expect(
        caller.evals.evalTemplateUsage({
          projectId: project.id,
          evalTemplateId: otherProjectTemplate.id,
        }),
      ).rejects.toThrow("Evaluator not found");
    });
  });

  describe("evals.deleteEvalTemplate", () => {
    it("should delete all versions of a project-owned evaluator", async () => {
      const { project, caller } = await prepare();

      const v1 = await createTemplateVersion(project.id, "delete-template", 1);
      const v2 = await createTemplateVersion(project.id, "delete-template", 2);

      await caller.evals.deleteEvalTemplate({
        projectId: project.id,
        evalTemplateId: v1.id,
      });

      const remainingVersions = await prisma.evalTemplate.findMany({
        where: { id: { in: [v1.id, v2.id] } },
      });
      expect(remainingVersions).toHaveLength(0);

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          projectId: project.id,
          resourceType: "evalTemplate",
          action: "delete",
          resourceId: { in: [v1.id, v2.id] },
        },
      });
      expect(auditLogs).toHaveLength(2);
    });

    it("should block deletion while a running evaluator references any version", async () => {
      const { project, caller } = await prepare();

      const v1 = await createTemplateVersion(project.id, "in-use-template", 1);
      const v2 = await createTemplateVersion(project.id, "in-use-template", 2);

      // job config references the old version; deleting via the latest
      // version id must still be blocked
      await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          evalTemplateId: v1.id,
          scoreName: "in-use-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "INACTIVE",
          timeScope: ["NEW"],
        },
      });

      await expect(
        caller.evals.deleteEvalTemplate({
          projectId: project.id,
          evalTemplateId: v2.id,
        }),
      ).rejects.toThrow(
        'Evaluator "in-use-template" is in use by 1 running evaluator(s): "in-use-score". Delete those running evaluators first.',
      );

      const remainingVersions = await prisma.evalTemplate.findMany({
        where: { id: { in: [v1.id, v2.id] } },
      });
      expect(remainingVersions).toHaveLength(2);
    });

    it("should reject deletion of langfuse-managed evaluators", async () => {
      const { project, caller } = await prepare();

      const managedTemplate = await createTemplateVersion(
        null,
        `langfuse-managed-template-${project.id}`,
        1,
      );

      try {
        await expect(
          caller.evals.deleteEvalTemplate({
            projectId: project.id,
            evalTemplateId: managedTemplate.id,
          }),
        ).rejects.toThrow("Langfuse-managed evaluators cannot be deleted");
      } finally {
        // managed templates are global and not covered by the org cleanup
        await prisma.evalTemplate.delete({ where: { id: managedTemplate.id } });
      }
    });

    it("should not delete evaluators of another project", async () => {
      const { project, caller } = await prepare();
      const { project: otherProject } = await prepare();

      const otherProjectTemplate = await createTemplateVersion(
        otherProject.id,
        "other-project-template",
        1,
      );

      await expect(
        caller.evals.deleteEvalTemplate({
          projectId: project.id,
          evalTemplateId: otherProjectTemplate.id,
        }),
      ).rejects.toThrow("Evaluator not found");

      const untouchedTemplate = await prisma.evalTemplate.findUnique({
        where: { id: otherProjectTemplate.id },
      });
      expect(untouchedTemplate).not.toBeNull();
    });

    it("should throw error when trying to delete non-existent eval template", async () => {
      const { project, caller } = await prepare();

      await expect(
        caller.evals.deleteEvalTemplate({
          projectId: project.id,
          evalTemplateId: "non-existent-id",
        }),
      ).rejects.toThrow("Evaluator not found");
    });

    it("should throw error when user lacks evalTemplate:CUD access scope", async () => {
      const { project, session } = await prepare();

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

      const evalTemplate = await createTemplateVersion(
        project.id,
        "no-access-template",
        1,
      );

      await expect(
        limitedCaller.evals.deleteEvalTemplate({
          projectId: project.id,
          evalTemplateId: evalTemplate.id,
        }),
      ).rejects.toThrow("User does not have access to this resource or action");
    });
  });
});
