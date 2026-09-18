import { randomUUID } from "node:crypto";
import type { Session } from "next-auth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

const mocks = vi.hoisted(() => ({
  getEvaluatorDefinitionPreflightError: vi.fn(async () => null),
}));

vi.mock(
  "@/src/features/evals/v2/server/evaluators/evaluatorValidation",
  () => ({ assertEvaluatorConfigurationValid: vi.fn() }),
);

vi.mock("@/src/features/evals/server/evaluator-preflight", () => ({
  getEvaluatorDefinitionPreflightError:
    mocks.getEvaluatorDefinitionPreflightError,
}));

const orgIds: string[] = [];
let projectId = "";
let otherProjectId = "";
let userId = "";
let caller: ReturnType<typeof appRouter.createCaller>;
let session: Session & { user: NonNullable<Session["user"]> };

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
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
        searchBar: false,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
      },
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
