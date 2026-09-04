import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock(
  "@/src/features/evals/v2/server/evaluators/evaluatorValidation",
  () => ({ assertEvaluatorConfigurationValid: vi.fn() }),
);

import { Prisma, prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  createPublicEvaluator,
  deletePublicEvaluator,
  getPublicEvaluator,
  listPublicEvaluators,
} from "@/src/features/evals/server/unstable-public-api/evaluator-service";

const orgIds: string[] = [];
let projectId = "";
let otherProjectId = "";

const input = (name: string, prompt: string) => ({
  name,
  type: "llm_as_judge" as const,
  prompt,
  modelConfig: null,
  outputDefinition: {
    dataType: "NUMERIC" as const,
    score: { description: "Quality" },
    reasoning: { description: "Reasoning" },
  },
});

beforeAll(async () => {
  const [first, second] = await Promise.all([
    createOrgProjectAndApiKey(),
    createOrgProjectAndApiKey(),
  ]);
  projectId = first.project.id;
  otherProjectId = second.project.id;
  orgIds.push(first.org.id, second.org.id);
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
});

describe("unstable evaluator API on stable evaluator storage", () => {
  it("creates and versions an evaluator by name", async () => {
    const first = await createPublicEvaluator({
      projectId,
      input: input("Public evaluator", "Judge {{output}}"),
    });
    const second = await createPublicEvaluator({
      projectId,
      input: input("Public evaluator", "Judge {{output}} strictly"),
    });
    const third = await createPublicEvaluator({
      projectId,
      input: input("Public evaluator", "Judge {{output}} strictly"),
    });

    expect(first).toMatchObject({ name: "Public evaluator", version: 1 });
    expect(second).toMatchObject({ name: first.name, version: 2 });
    expect(third).toMatchObject({ name: first.name, version: 3 });
    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
  });

  it("returns the latest evaluator and its rule count", async () => {
    const first = await createPublicEvaluator({
      projectId,
      input: input("Public evaluator", "Judge {{output}}"),
    });
    const latest = await createPublicEvaluator({
      projectId,
      input: input("Public evaluator", "Judge {{output}} strictly"),
    });
    await prisma.evaluationRule.create({
      data: {
        projectId,
        name: "Public evaluator rule",
        status: "INACTIVE",
        targetObject: "EVENT",
        filter: [],
        sampling: 1,
        delay: 0,
        assignments: {
          create: {
            projectId,
            evaluatorId: first.id,
            variableMapping: Prisma.DbNull,
          },
        },
      },
    });

    await expect(
      getPublicEvaluator({ projectId, evaluatorId: first.id }),
    ).resolves.toMatchObject({
      id: first.id,
      version: latest.version,
      evaluationRuleCount: 1,
    });
  });

  it("ignores stale legacy job configurations when counting evaluator rules", async () => {
    const evaluator = await createPublicEvaluator({
      projectId,
      input: input("Public evaluator", "Judge {{output}}"),
    });
    await prisma.evalTemplate.create({
      data: {
        id: evaluator.id,
        projectId,
        name: evaluator.name,
        version: 1,
        prompt: "Judge {{output}}",
        type: "LLM_AS_JUDGE",
        vars: ["output"],
        outputDefinition: Prisma.DbNull,
      },
    });
    const legacyRule = await prisma.jobConfiguration.create({
      data: {
        projectId,
        jobType: "EVAL",
        status: "INACTIVE",
        evalTemplateId: evaluator.id,
        scoreName: "Stale legacy rule",
        targetObject: "event",
        filter: [],
        variableMapping: [],
        sampling: 1,
        delay: 0,
      },
    });

    await expect(
      getPublicEvaluator({ projectId, evaluatorId: evaluator.id }),
    ).resolves.toMatchObject({ evaluationRuleCount: 0 });

    await prisma.jobConfiguration.delete({ where: { id: legacyRule.id } });
    await prisma.evalTemplate.delete({ where: { id: evaluator.id } });
  });

  it("rejects legacy version IDs and cross-project reads", async () => {
    const evaluator = await createPublicEvaluator({
      projectId,
      input: input("Public evaluator", "Judge {{output}}"),
    });
    const oldVersion = await prisma.evaluatorVersion.findFirstOrThrow({
      where: { evaluatorId: evaluator.id, version: 1 },
      select: { id: true },
    });
    await expect(
      getPublicEvaluator({ projectId, evaluatorId: oldVersion.id }),
    ).rejects.toThrow("Evaluator not found");
    await expect(
      getPublicEvaluator({
        projectId: otherProjectId,
        evaluatorId: evaluator.id,
      }),
    ).rejects.toThrow("Evaluator not found");
  });

  it("returns an empty evaluator list", async () => {
    await expect(
      listPublicEvaluators({ projectId, page: 1, limit: 50 }),
    ).resolves.toMatchObject({
      data: [],
      meta: { page: 1, limit: 50, totalItems: 0, totalPages: 0 },
    });
  });

  it("lists only the latest evaluators from the requested project", async () => {
    const first = await createPublicEvaluator({
      projectId,
      input: input("Public evaluator", "Judge {{output}}"),
    });
    const latest = await createPublicEvaluator({
      projectId,
      input: input("Public evaluator", "Judge {{output}} strictly"),
    });
    await createPublicEvaluator({
      projectId: otherProjectId,
      input: input("Public evaluator", "Other project {{output}}"),
    });

    const projectList = await listPublicEvaluators({
      projectId,
      page: 1,
      limit: 50,
    });
    expect(projectList.data).toEqual([
      expect.objectContaining({ id: first.id, version: latest.version }),
    ]);
    expect(projectList.meta).toMatchObject({ totalItems: 1, totalPages: 1 });
  });

  it("paginates evaluator lists", async () => {
    const [older, newer] = await Promise.all([
      createPublicEvaluator({
        projectId,
        input: input("Older evaluator", "Judge {{output}}"),
      }),
      createPublicEvaluator({
        projectId,
        input: input("Newer evaluator", "Judge {{output}}"),
      }),
    ]);
    await Promise.all([
      prisma.evaluator.update({
        where: { id: older.id },
        data: { updatedAt: new Date("2026-01-01T00:00:00.000Z") },
      }),
      prisma.evaluator.update({
        where: { id: newer.id },
        data: { updatedAt: new Date("2026-01-02T00:00:00.000Z") },
      }),
    ]);

    await expect(
      listPublicEvaluators({ projectId, page: 1, limit: 1 }),
    ).resolves.toMatchObject({
      data: [{ id: newer.id }],
      meta: { page: 1, limit: 1, totalItems: 2, totalPages: 2 },
    });
    await expect(
      listPublicEvaluators({ projectId, page: 2, limit: 1 }),
    ).resolves.toMatchObject({
      data: [{ id: older.id }],
      meta: { page: 2, limit: 1, totalItems: 2, totalPages: 2 },
    });
  });

  it("deletes the evaluator and its rule assignments", async () => {
    const evaluator = await createPublicEvaluator({
      projectId,
      input: input("Public evaluator", "Judge {{output}}"),
    });
    const rule = await prisma.evaluationRule.create({
      data: {
        projectId,
        name: "Public evaluator rule",
        status: "INACTIVE",
        targetObject: "EVENT",
        filter: [],
        sampling: 1,
        delay: 0,
        assignments: {
          create: {
            projectId,
            evaluatorId: evaluator.id,
            variableMapping: Prisma.DbNull,
          },
        },
      },
    });

    await deletePublicEvaluator({ projectId, evaluatorId: evaluator.id });

    await expect(
      prisma.evaluationRuleEvaluatorAssignment.count({
        where: { evaluationRuleId: rule.id, evaluatorId: evaluator.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.evaluator.findUnique({ where: { id: evaluator.id } }),
    ).resolves.toBeNull();
  });

  it("rejects ambiguous legacy name upserts", async () => {
    await prisma.evaluator.createMany({
      data: [
        { projectId, name: "Duplicate", type: "LLM_AS_JUDGE" },
        { projectId, name: "Duplicate", type: "LLM_AS_JUDGE" },
      ],
    });

    await expect(
      createPublicEvaluator({
        projectId,
        input: input("Duplicate", "Judge {{output}}"),
      }),
    ).rejects.toMatchObject({ httpCode: 409 });
  });
});
