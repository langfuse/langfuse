import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { randomUUID } from "node:crypto";
import type { Session } from "next-auth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma, type Role } from "@langfuse/shared/src/db";
import {
  createEvent,
  createEventsCh,
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import type * as EvaluatorValidationModule from "@/src/features/evals/v2/server/evaluators/evaluatorValidation";

const mocks = vi.hoisted(() => ({
  getEvaluatorDefinitionPreflightError: vi.fn(async () => null),
  getActivationCostEstimates: vi.fn(async () => []),
}));

vi.mock(
  "@/src/features/evals/v2/server/evaluators/evaluatorValidation",
  async (importOriginal) => ({
    ...(await importOriginal<typeof EvaluatorValidationModule>()),
    assertEvaluatorConfigurationValid: vi.fn(),
  }),
);

vi.mock("@/src/features/evals/server/evaluator-preflight", () => ({
  getEvaluatorDefinitionPreflightError:
    mocks.getEvaluatorDefinitionPreflightError,
}));

vi.mock(
  "@/src/features/evals/v2/server/evaluators/activationCostService",
  () => ({
    getActivationCostEstimates: mocks.getActivationCostEstimates,
  }),
);

const orgIds: string[] = [];
let projectId = "";
let otherProjectId = "";
let userId = "";
let caller: ReturnType<typeof appRouter.createCaller>;
let session: Session & { user: NonNullable<Session["user"]> };

function createCallerWithProjectRole(
  role: Role,
  { v4BetaEnabled = false }: { v4BetaEnabled?: boolean } = {},
) {
  const roleSession = {
    ...session,
    user: {
      ...session.user,
      v4BetaEnabled,
      organizations: session.user.organizations.map((organization) => ({
        ...organization,
        projects: organization.projects.map((project) => ({
          ...project,
          role,
        })),
      })),
    },
  };
  const ctx = createInnerTRPCContext({ session: roleSession, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
}

const definition = {
  type: "LLM_AS_JUDGE" as const,
  promptMessages: [{ role: "user" as const, content: "Judge {{output}}" }],
  modelConfig: null,
  variableMapping: [{ templateVariable: "output", selectedColumnId: "output" }],
  outputDefinition: {
    dataType: "NUMERIC" as const,
    score: { description: "Quality" },
    reasoning: { description: "Reasoning" },
  },
};

beforeAll(async () => {
  const [first, second] = await Promise.all([
    createOrgProjectAndApiKey(),
    createOrgProjectAndApiKey(),
  ]);
  projectId = first.project.id;
  otherProjectId = second.project.id;
  orgIds.push(first.org.id, second.org.id);
  userId = randomUUID();
  await prisma.user.create({
    data: { id: userId, name: "Evaluator tester", email: `${userId}@test.dev` },
  });

  session = {
    expires: "1",
    user: {
      id: userId,
      name: "Evaluator tester",
      admin: false,
      canCreateOrganizations: false,
      organizations: [
        {
          id: first.org.id,
          name: first.org.name,
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: true,
          aiTelemetryEnabled: false,
          projects: [
            {
              id: projectId,
              name: first.project.name,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              hasTraces: false,
              metadata: {},
              createdAt: first.project.createdAt.toISOString(),
            },
          ],
        },
      ],
      featureFlags: testFeatureFlags(),
      v4BetaEnabled: false,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  } satisfies Session;
  const ctx = createInnerTRPCContext({ session, headers: {} });
  caller = appRouter.createCaller({ ...ctx, prisma });
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("evalsV2 tRPC", () => {
  it("allows viewers to estimate costs without running a missing-cost test", async () => {
    const viewerCaller = createCallerWithProjectRole("VIEWER");
    const memberCaller = createCallerWithProjectRole("MEMBER");
    const input = {
      projectId,
      evaluatorIds: ["evaluator-id"],
      filter: [],
      sampling: 1,
      shouldRunMissingTest: true,
    };

    await viewerCaller.evalsV2.activationCostEstimates(input);
    expect(mocks.getActivationCostEstimates).toHaveBeenLastCalledWith(
      expect.objectContaining({ missingCostMode: "skip" }),
    );

    await memberCaller.evalsV2.activationCostEstimates(input);
    expect(mocks.getActivationCostEstimates).toHaveBeenLastCalledWith(
      expect.objectContaining({ missingCostMode: "probe" }),
    );
  });

  it("rejects cost estimates without execution read access", async () => {
    const noAccessCaller = createCallerWithProjectRole("NONE");

    await expect(
      noAccessCaller.evalsV2.activationCostEstimates({
        projectId,
        evaluatorIds: ["evaluator-id"],
        filter: [],
        sampling: 1,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects execution summaries without read access or for another project", async () => {
    const input = { projectId, evaluatorIds: [randomUUID()] };

    await expect(
      createCallerWithProjectRole("NONE").evalsV2.executionSummaries(input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.evalsV2.executionSummaries({
        ...input,
        projectId: otherProjectId,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("summarizes only executions from the caller's project", async () => {
    const evaluatorId = randomUUID();
    await createEventsCh([
      createEvent({
        project_id: projectId,
        trace_id: randomUUID(),
        evaluator_id: evaluatorId,
      }),
      createEvent({
        project_id: otherProjectId,
        trace_id: randomUUID(),
        evaluator_id: evaluatorId,
        level: "ERROR",
      }),
    ]);

    await expect(
      caller.evalsV2.executionSummaries({
        projectId,
        evaluatorIds: [evaluatorId],
      }),
    ).resolves.toEqual({ [evaluatorId]: { total: 1, failed: 0 } });
  });

  it("rejects evaluator tests without write access or for another project", async () => {
    const foreignEvaluator = await prisma.evaluator.create({
      data: {
        projectId: otherProjectId,
        name: "Foreign test evaluator",
        type: "LLM_AS_JUDGE",
        versions: { create: { version: 1 } },
      },
    });
    const input = {
      projectId,
      evaluatorId: randomUUID(),
      definition,
      observationId: randomUUID(),
      traceId: randomUUID(),
      startTime: new Date(),
    };

    await expect(
      createCallerWithProjectRole("VIEWER").evalsV2.test(input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.evalsV2.test({ ...input, projectId: otherProjectId }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.evalsV2.test({ ...input, evaluatorId: foreignEvaluator.id }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Evaluator not found",
    });
  });

  it("tests evaluators only against observations from the caller's project", async () => {
    const startTime = new Date();
    const [own, foreign] = [projectId, otherProjectId].map((project) => ({
      projectId: project,
      observationId: randomUUID(),
      traceId: randomUUID(),
    }));
    await Promise.all([
      createObservationsCh(
        [own, foreign].map((target) =>
          createObservation({
            project_id: target.projectId,
            id: target.observationId,
            trace_id: target.traceId,
            start_time: startTime,
          }),
        ),
      ),
      createEventsCh(
        [own, foreign].map((target) =>
          createEvent({
            project_id: target.projectId,
            id: target.observationId,
            span_id: target.observationId,
            trace_id: target.traceId,
            start_time: startTime,
          }),
        ),
      ),
    ]);

    for (const v4BetaEnabled of [false, true]) {
      const memberCaller = createCallerWithProjectRole("MEMBER", {
        v4BetaEnabled,
      });
      const testInput = (target: typeof own) => ({
        projectId,
        evaluatorId: randomUUID(),
        definition,
        observationId: target.observationId,
        traceId: target.traceId,
        startTime,
      });

      // The project has no default model, so a resolved observation ends in an
      // unsuccessful test result rather than an LLM call.
      await expect(
        memberCaller.evalsV2.test(testInput(own)),
      ).resolves.toMatchObject({ success: false });
      await expect(
        memberCaller.evalsV2.test(testInput(foreign)),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Observation not found",
      });
    }
  });

  it("supports the evaluator management flow", async () => {
    const created = await caller.evalsV2.create({
      projectId,
      name: "Transport evaluator",
      description: null,
      definition,
    });

    const updated = await caller.evalsV2.update({
      projectId,
      evaluatorId: created.id,
      name: "Renamed transport evaluator",
      description: "Updated through tRPC",
      definition: {
        ...definition,
        promptMessages: [
          { role: "user", content: "Judge this carefully: {{output}}" },
        ],
      },
    });

    const [listed, versions] = await Promise.all([
      caller.evalsV2.list({ projectId, search: "Renamed transport" }),
      caller.evalsV2.versions({
        projectId,
        evaluatorId: created.id,
        limit: 50,
      }),
    ]);

    expect(updated).toMatchObject({
      id: created.id,
      projectId,
      name: "Renamed transport evaluator",
      description: "Updated through tRPC",
    });
    expect(listed).toMatchObject({
      evaluators: [
        expect.objectContaining({
          id: created.id,
          name: "Renamed transport evaluator",
          versions: [expect.objectContaining({ version: 2 })],
        }),
      ],
      totalItems: 1,
    });
    expect(versions).toEqual({
      data: [
        expect.objectContaining({ version: 2 }),
        expect.objectContaining({ version: 1 }),
      ],
      nextCursor: undefined,
    });

    await expect(
      caller.evalsV2.delete({ projectId, evaluatorId: created.id }),
    ).resolves.toEqual({ success: true });
    await expect(
      caller.evalsV2.get({ projectId, evaluatorId: created.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("paginates evaluator gallery results", async () => {
    const search = `Gallery pagination ${randomUUID()}`;
    const created = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        caller.evalsV2.create({
          projectId,
          name: `${search} ${index + 1}`,
          description: null,
          definition,
        }),
      ),
    );

    const firstPage = await caller.evalsV2.listGallery({
      projectId,
      search,
      limit: 2,
    });
    const firstPageIds = new Set(
      firstPage.evaluators.map((evaluator) => evaluator.id),
    );
    const remainingId = created.find(
      (evaluator) => !firstPageIds.has(evaluator.id),
    )?.id;
    if (!remainingId) throw new Error("Expected an evaluator on the next page");
    await prisma.evaluator.update({
      where: { id: remainingId },
      data: { updatedAt: new Date(Date.now() + 60_000) },
    });

    const secondPage = await caller.evalsV2.listGallery({
      projectId,
      search,
      limit: 2,
      cursor: firstPage.nextCursor,
    });

    expect(firstPage.evaluators).toHaveLength(2);
    expect(firstPage.totalItems).toBe(3);
    expect(firstPage.nextCursor).toEqual({
      createdAt: expect.any(Date),
      id: expect.any(String),
    });
    expect(secondPage.evaluators).toHaveLength(1);
    expect(secondPage.totalItems).toBeUndefined();
    expect(secondPage.nextCursor).toBeUndefined();
    expect(
      new Set(
        [...firstPage.evaluators, ...secondPage.evaluators].map(
          (evaluator) => evaluator.id,
        ),
      ),
    ).toEqual(new Set(created.map((evaluator) => evaluator.id)));
  });

  it("rejects access to another project", async () => {
    await expect(
      caller.evalsV2.list({ projectId: otherProjectId }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.evalsV2.create({
        projectId: otherProjectId,
        name: "Unauthorized evaluator",
        description: null,
        definition,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("reactivates a project-scoped evaluator after model preflight", async () => {
    const evaluator = await caller.evalsV2.create({
      projectId,
      name: "Blocked transport evaluator",
      description: null,
      definition,
    });
    await prisma.evaluator.update({
      where: { id: evaluator.id, projectId },
      data: {
        blockedAt: new Date(),
        blockReason: "DEFAULT_EVAL_MODEL_MISSING",
        blockMessage: "Blocked for test",
      },
    });

    await expect(
      caller.evalsV2.reactivate({ projectId, evaluatorId: evaluator.id }),
    ).resolves.toMatchObject({
      id: evaluator.id,
      blockedAt: null,
      blockReason: null,
      blockMessage: null,
    });
    expect(mocks.getEvaluatorDefinitionPreflightError).toHaveBeenCalledOnce();

    await expect(
      caller.evalsV2.reactivate({
        projectId: otherProjectId,
        evaluatorId: evaluator.id,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects evaluator writes without write access", async () => {
    const evaluator = await caller.evalsV2.create({
      projectId,
      name: "Viewer write target",
      description: null,
      definition,
    });

    for (const write of evaluatorWrites(
      createCallerWithProjectRole("VIEWER"),
      evaluator.id,
    )) {
      await expect(write()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }

    await expect(
      prisma.evaluator.count({ where: { id: evaluator.id } }),
    ).resolves.toBe(1);
  });

  it("rejects writes to built-in evaluators", async () => {
    const builtIn = await caller.evalsV2.create({
      projectId,
      name: "Built-in transport evaluator",
      description: null,
      definition,
    });
    const blockedAt = new Date("2026-01-01T00:00:00.000Z");
    await prisma.evaluator.update({
      where: { id: builtIn.id, projectId },
      data: {
        isBuiltIn: true,
        blockedAt,
        blockReason: "DEFAULT_EVAL_MODEL_MISSING",
        blockMessage: "Blocked for test",
      },
    });

    for (const write of evaluatorWrites(
      createCallerWithProjectRole("MEMBER"),
      builtIn.id,
    )) {
      await expect(write()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }

    await expect(
      prisma.evaluator.findUnique({
        where: { id: builtIn.id },
        select: {
          name: true,
          blockedAt: true,
          _count: { select: { versions: true } },
        },
      }),
    ).resolves.toEqual({
      name: builtIn.name,
      blockedAt,
      _count: { versions: 1 },
    });
  });

  it("treats FACET evaluators as missing on writes", async () => {
    const blockedAt = new Date("2026-01-01T00:00:00.000Z");
    const facet = await prisma.evaluator.create({
      data: {
        projectId,
        name: "Internal transport facet",
        type: "FACET",
        blockedAt,
        blockReason: "DEFAULT_EVAL_MODEL_MISSING",
        blockMessage: "Blocked for test",
        versions: { create: { version: 1 } },
      },
    });

    for (const write of evaluatorWrites(
      createCallerWithProjectRole("MEMBER"),
      facet.id,
    )) {
      await expect(write()).rejects.toMatchObject({ code: "NOT_FOUND" });
    }

    await expect(
      prisma.evaluator.findUnique({
        where: { id: facet.id },
        select: {
          name: true,
          blockedAt: true,
          _count: { select: { versions: true } },
        },
      }),
    ).resolves.toEqual({
      name: facet.name,
      blockedAt,
      _count: { versions: 1 },
    });
  });

  it("returns evaluator costs through the tRPC contract", async () => {
    const evaluator = await caller.evalsV2.create({
      projectId,
      name: "Cost evaluator",
      description: null,
      definition: {
        type: "CODE",
        sourceCode: "return 1;",
        sourceCodeLanguage: "TYPESCRIPT",
      },
    });
    await createEventsCh([
      createEvent({
        project_id: projectId,
        trace_id: randomUUID(),
        evaluator_id: evaluator.id,
        type: "GENERATION",
        cost_details: { total: 0.02 },
      }),
    ]);

    const costs = await caller.evalsV2.costByEvaluatorIds({
      projectId,
      evaluatorIds: [evaluator.id],
    });

    expect(costs).toEqual({ [evaluator.id]: 0.02 });
  });

  it("keeps legacy rule history while including evaluator-addressed executions", async () => {
    const evaluator = await caller.evalsV2.create({
      projectId,
      name: "Migrated evaluator history",
      description: null,
      definition,
    });
    const rule = await prisma.evaluationRule.create({
      data: {
        projectId,
        name: "Migrated legacy rule",
        status: "ACTIVE",
        targetObject: "trace",
        filter: [],
        sampling: 1,
        delay: 0,
        assignments: {
          create: { projectId, evaluatorId: evaluator.id },
        },
      },
    });
    await prisma.jobExecution.createMany({
      data: [
        {
          projectId,
          jobConfigurationId: rule.id,
          status: "ERROR",
          error: "Historical legacy failure",
        },
        {
          projectId,
          jobConfigurationId: evaluator.id,
          status: "COMPLETED",
        },
        {
          projectId,
          jobConfigurationId: "unrelated-evaluator-id",
          status: "PENDING",
        },
      ],
    });

    await expect(
      caller.evals.jobExecutionCountsByEvaluatorIds({
        projectId,
        evaluatorIds: [rule.id],
      }),
    ).resolves.toEqual({
      [rule.id]: expect.arrayContaining([
        { status: "ERROR", count: 1 },
        { status: "COMPLETED", count: 1 },
      ]),
    });

    await expect(
      caller.evals.getLogs({
        projectId,
        jobConfigurationId: rule.id,
        filter: [],
        page: 0,
        limit: 50,
      }),
    ).resolves.toMatchObject({
      totalCount: 2,
      data: expect.arrayContaining([
        expect.objectContaining({
          jobConfigurationId: rule.id,
          status: "ERROR",
        }),
        expect.objectContaining({
          jobConfigurationId: evaluator.id,
          status: "COMPLETED",
        }),
      ]),
    });
  });
});

function evaluatorWrites(
  roleCaller: ReturnType<typeof appRouter.createCaller>,
  evaluatorId: string,
) {
  return [
    () =>
      roleCaller.evalsV2.update({
        projectId,
        evaluatorId,
        name: "Renamed protected evaluator",
        description: null,
        definition,
      }),
    () => roleCaller.evalsV2.reactivate({ projectId, evaluatorId }),
    () => roleCaller.evalsV2.delete({ projectId, evaluatorId }),
    () =>
      roleCaller.evalsV2.deleteMany({ projectId, evaluatorIds: [evaluatorId] }),
  ];
}
