import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { randomUUID } from "node:crypto";
import type { Session } from "next-auth";
import { EvalTargetObject } from "@langfuse/shared";
import {
  JobConfigState,
  prisma,
  type Prisma,
  type Role,
} from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

const orgIds: string[] = [];
let projectId = "";
let otherProjectId = "";
let userId = "";
let session: Session;
let caller: ReturnType<typeof appRouter.createCaller>;

function callerFor(callerSession: Session) {
  const ctx = createInnerTRPCContext({
    session: callerSession,
    headers: {},
  });
  return appRouter.createCaller({ ...ctx, prisma });
}

function sessionWithProjectRole(role: Role): Session {
  const [org] = session.user!.organizations;
  return {
    ...session,
    user: {
      ...session.user!,
      organizations: [
        { ...org, projects: org.projects.map((p) => ({ ...p, role })) },
      ],
    },
  };
}

function experimentDatasetRule(
  ruleProjectId: string,
  name: string,
  datasetId: string,
) {
  return {
    projectId: ruleProjectId,
    name,
    status: JobConfigState.ACTIVE,
    targetObject: EvalTargetObject.EVENT,
    filter: [
      {
        column: "isExperimentItemRootSpan",
        type: "boolean",
        operator: "=",
        value: true,
      },
      {
        column: "experimentDatasetId",
        type: "stringOptions",
        operator: "any of",
        value: [datasetId],
      },
    ],
    sampling: 1,
    delay: 0,
    timeScope: ["NEW"],
  };
}

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
    data: { id: userId, name: "Rule tester", email: `${userId}@test.dev` },
  });

  session = {
    expires: "1",
    user: {
      id: userId,
      name: "Rule tester",
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
  caller = callerFor(session);
});

afterEach(async () => {
  await prisma.evaluationRule.deleteMany({
    where: { projectId: { in: [projectId, otherProjectId] } },
  });
  await prisma.evaluator.deleteMany({
    where: { projectId: { in: [projectId, otherProjectId] } },
  });
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

function createEvaluator(name: string) {
  return prisma.evaluator.create({
    data: {
      projectId,
      name,
      type: "LLM_AS_JUDGE",
      versions: {
        create: {
          version: 1,
          prompt: "Judge {{output}}",
          vars: ["output"],
          variableMapping: [
            { templateVariable: "output", selectedColumnId: "output" },
          ],
        },
      },
    },
  });
}

function ruleInput(evaluatorId?: string) {
  return {
    projectId,
    name: "Transport rule",
    filter: [],
    sampling: 1,
    enabled: true as const,
    evaluatorAssignments: evaluatorId
      ? [{ evaluatorId, variableMapping: null }]
      : [],
  };
}

describe("evaluation rule v2 tRPC", () => {
  it("supports the rule lifecycle", async () => {
    const evaluator = await createEvaluator("Transport evaluator");
    const created = await caller.evalsV2.rules.create(ruleInput(evaluator.id));
    const updated = await caller.evalsV2.rules.update({
      projectId,
      ruleId: created.id,
      name: "Updated transport rule",
      sampling: 0.5,
    });
    const listed = await caller.evalsV2.rules.list({ projectId });

    expect(updated).toMatchObject({
      id: created.id,
      name: "Updated transport rule",
      sampling: 0.5,
    });
    expect(listed).toMatchObject({
      rules: [expect.objectContaining({ id: created.id })],
      totalItems: 1,
    });

    await expect(
      caller.evalsV2.rules.delete({ projectId, ruleId: created.id }),
    ).resolves.toEqual({ success: true });
    await expect(
      caller.evalsV2.rules.get({ projectId, ruleId: created.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("filters the rule table to rules that require an upgrade", async () => {
    await Promise.all([
      prisma.evaluationRule.create({
        data: {
          projectId,
          name: "Actionable trace rule",
          status: JobConfigState.ACTIVE,
          targetObject: EvalTargetObject.TRACE,
          filter: [],
          sampling: 1,
          delay: 0,
          timeScope: ["NEW"],
        },
      }),
      prisma.evaluationRule.create({
        data: {
          projectId,
          name: "Backfill-only trace rule",
          status: JobConfigState.ACTIVE,
          targetObject: EvalTargetObject.TRACE,
          filter: [],
          sampling: 1,
          delay: 0,
          timeScope: ["EXISTING"],
        },
      }),
      prisma.evaluationRule.create({
        data: {
          projectId,
          name: "Inactive trace rule",
          status: JobConfigState.INACTIVE,
          targetObject: EvalTargetObject.TRACE,
          filter: [],
          sampling: 1,
          delay: 0,
          timeScope: ["NEW"],
        },
      }),
      prisma.evaluationRule.create({
        data: {
          projectId,
          name: "Modern observation rule",
          status: JobConfigState.ACTIVE,
          targetObject: EvalTargetObject.EVENT,
          filter: [],
          sampling: 1,
          delay: 0,
          timeScope: ["NEW"],
        },
      }),
    ]);

    const listed = await caller.evalsV2.rules.list({
      projectId,
      filter: [
        {
          column: "upgradeRequired",
          type: "boolean",
          operator: "=",
          value: true,
        },
      ],
    });

    expect(listed.rules.map(({ name }) => name)).toEqual([
      "Actionable trace rule",
    ]);
    expect(listed.totalItems).toBe(1);
  });

  it("lists every experiment rule scoped to a dataset, beyond the newest page", async () => {
    const datasetId = randomUUID();
    const datasetCondition = (column: string, value: string[]) => ({
      column,
      type: "stringOptions",
      operator: "any of",
      value,
    });
    const experimentRoot = {
      column: "isExperimentItemRootSpan",
      type: "boolean",
      operator: "=",
      value: true,
    };
    const storedRule = (
      name: string,
      filter: Prisma.InputJsonValue,
      createdAt: Date,
      targetObject: EvalTargetObject = EvalTargetObject.EVENT,
    ) => ({
      projectId,
      name,
      status: JobConfigState.ACTIVE,
      targetObject,
      filter,
      sampling: 1,
      delay: 0,
      timeScope: ["NEW"],
      createdAt,
    });
    const older = new Date(Date.now() - 60_000);
    await prisma.evaluationRule.createMany({
      data: [
        storedRule(
          "Form rule",
          [
            experimentRoot,
            datasetCondition("experimentDatasetId", [datasetId]),
          ],
          older,
        ),
        storedRule(
          "Rule with extra condition",
          [
            experimentRoot,
            datasetCondition("experimentDatasetId", [datasetId, "other"]),
            { column: "name", type: "string", operator: "=", value: "answer" },
          ],
          older,
        ),
        storedRule(
          "Legacy experiment rule",
          [datasetCondition("Dataset", [datasetId])],
          older,
          EvalTargetObject.EXPERIMENT,
        ),
        storedRule(
          "Observation rule without experiment condition",
          [datasetCondition("experimentDatasetId", [datasetId])],
          older,
        ),
        storedRule(
          "Other dataset",
          [experimentRoot, datasetCondition("experimentDatasetId", ["other"])],
          older,
        ),
        ...Array.from({ length: 100 }, (_, index) =>
          storedRule(`Newer unrelated rule ${index}`, [], new Date()),
        ),
      ],
    });

    const rules = await caller.evalsV2.rules.listForExperimentDataset({
      projectId,
      datasetId,
    });

    expect(rules.map(({ name }) => name).sort()).toEqual([
      "Form rule",
      "Legacy experiment rule",
      "Rule with extra condition",
    ]);
  });

  describe("listForExperimentDataset access", () => {
    it("lists only the caller's rules when another project has a rule for the same dataset", async () => {
      const datasetId = randomUUID();
      await prisma.evaluationRule.createMany({
        data: [
          experimentDatasetRule(projectId, "Own dataset rule", datasetId),
          experimentDatasetRule(
            otherProjectId,
            "Foreign dataset rule",
            datasetId,
          ),
        ],
      });

      const rules = await caller.evalsV2.rules.listForExperimentDataset({
        projectId,
        datasetId,
      });

      expect(rules.map(({ name }) => name)).toEqual(["Own dataset rule"]);
    });

    it("rejects a project member without evaluationRule:read", async () => {
      const datasetId = randomUUID();
      await prisma.evaluationRule.create({
        data: experimentDatasetRule(projectId, "Own dataset rule", datasetId),
      });

      await expect(
        callerFor(
          sessionWithProjectRole("NONE"),
        ).evalsV2.rules.listForExperimentDataset({ projectId, datasetId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  it("creates a disabled rule", async () => {
    await expect(
      caller.evalsV2.rules.create({ ...ruleInput(), enabled: false }),
    ).resolves.toMatchObject({ enabled: false });
  });

  it("rejects unsupported filters when creating a rule", async () => {
    await expect(
      caller.evalsV2.rules.create({
        ...ruleInput(),
        filter: [
          {
            column: "totalCost",
            type: "number",
            operator: ">",
            value: 0.01,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining(
        'Filter column "totalCost" is not supported',
      ),
    });
    await expect(
      prisma.evaluationRule.count({ where: { projectId } }),
    ).resolves.toBe(0);
  });

  it("supports attaching with activation and detaching an evaluator", async () => {
    const [first, second] = await Promise.all([
      createEvaluator("First transport evaluator"),
      createEvaluator("Second transport evaluator"),
    ]);
    const rule = await caller.evalsV2.rules.create({
      ...ruleInput(first.id),
      enabled: false,
    });
    const attached = await caller.evalsV2.rules.attach({
      projectId,
      ruleId: rule.id,
      evaluatorId: second.id,
      variableMapping: [
        { templateVariable: "output", selectedColumnId: "input" },
      ],
      enableRule: true,
    });

    expect(attached.enabled).toBe(true);
    expect(attached.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evaluatorId: second.id }),
      ]),
    );
    await expect(
      caller.evalsV2.rules.detach({
        projectId,
        ruleId: rule.id,
        evaluatorId: second.id,
      }),
    ).resolves.toMatchObject({
      assignments: [expect.objectContaining({ evaluatorId: first.id })],
    });
  });

  it("rejects reads and writes for another project", async () => {
    await expect(
      caller.evalsV2.rules.list({ projectId: otherProjectId }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.evalsV2.rules.listForExperimentDataset({
        projectId: otherProjectId,
        datasetId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.evalsV2.rules.create({
        ...ruleInput(),
        projectId: otherProjectId,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
