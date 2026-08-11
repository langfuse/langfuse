import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as assignmentRepository from "@/src/features/evals/v2/server/assignments/assignmentRepository";

const orgIds: string[] = [];
let projectId = "";
let otherProjectId = "";

const createEvaluator = (targetProjectId = projectId) =>
  prisma.evaluator.create({
    data: {
      projectId: targetProjectId,
      name: `evaluator-${randomUUID()}`,
      type: "CODE",
    },
  });

const createRuleAssignment = async ({
  targetProjectId = projectId,
  evaluatorId,
  assignmentId = `assignment-${randomUUID()}`,
}: {
  targetProjectId?: string;
  evaluatorId: string;
  assignmentId?: string;
}) => {
  await prisma.evaluationRule.create({
    data: {
      projectId: targetProjectId,
      name: `rule-${randomUUID()}`,
      status: "ACTIVE",
      targetObject: "EVENT",
      filter: [],
      sampling: 1,
      delay: 0,
      assignments: {
        create: {
          id: assignmentId,
          projectId: targetProjectId,
          evaluatorId,
          variableMapping: {},
        },
      },
    },
  });
  return assignmentId;
};

const createAssignmentPageFixture = async () => {
  const [firstEvaluator, secondEvaluator] = await Promise.all([
    createEvaluator(),
    createEvaluator(),
  ]);
  const firstId = `assignment-a-${randomUUID()}`;
  const secondId = `assignment-b-${randomUUID()}`;
  await Promise.all([
    createRuleAssignment({
      evaluatorId: firstEvaluator.id,
      assignmentId: firstId,
    }),
    createRuleAssignment({
      evaluatorId: firstEvaluator.id,
      assignmentId: secondId,
    }),
    createRuleAssignment({ evaluatorId: secondEvaluator.id }),
    createRuleAssignment({
      targetProjectId: otherProjectId,
      evaluatorId: firstEvaluator.id,
    }),
  ]);
  return { firstEvaluator, firstId, secondId };
};

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

describe("evaluator v2 assignment repository", () => {
  describe("listEvaluatorRuleAssignments", () => {
    it("filters assignments by evaluator and project", async () => {
      const { firstEvaluator, firstId, secondId } =
        await createAssignmentPageFixture();

      await expect(
        assignmentRepository.listEvaluatorRuleAssignments({
          prisma,
          projectId,
          evaluatorIds: [firstEvaluator.id],
          limit: 10,
        }),
      ).resolves.toMatchObject({
        data: [
          { id: firstId, evaluatorId: firstEvaluator.id },
          { id: secondId, evaluatorId: firstEvaluator.id },
        ],
        nextCursor: undefined,
      });
    });

    it("paginates assignments by ID", async () => {
      const { firstEvaluator, firstId, secondId } =
        await createAssignmentPageFixture();

      await expect(
        assignmentRepository.listEvaluatorRuleAssignments({
          prisma,
          projectId,
          evaluatorIds: [firstEvaluator.id],
          limit: 1,
        }),
      ).resolves.toMatchObject({
        data: [{ id: firstId, evaluatorId: firstEvaluator.id }],
        nextCursor: firstId,
      });
      await expect(
        assignmentRepository.listEvaluatorRuleAssignments({
          prisma,
          projectId,
          evaluatorIds: [firstEvaluator.id],
          cursor: firstId,
          limit: 1,
        }),
      ).resolves.toMatchObject({
        data: [{ id: secondId, evaluatorId: firstEvaluator.id }],
        nextCursor: undefined,
      });
    });

    it("returns an empty page for an empty evaluator selection", async () => {
      await expect(
        assignmentRepository.listEvaluatorRuleAssignments({
          prisma,
          projectId,
          evaluatorIds: [],
          limit: 10,
        }),
      ).resolves.toEqual({ data: [], nextCursor: undefined });
    });
  });

  describe("countEvaluatorAssignments", () => {
    it("returns assignment counts from the requested project", async () => {
      const [firstEvaluator, secondEvaluator] = await Promise.all([
        createEvaluator(),
        createEvaluator(),
      ]);
      await Promise.all([
        createRuleAssignment({ evaluatorId: firstEvaluator.id }),
        createRuleAssignment({ evaluatorId: firstEvaluator.id }),
        createRuleAssignment({
          targetProjectId: otherProjectId,
          evaluatorId: firstEvaluator.id,
        }),
      ]);

      await expect(
        assignmentRepository.countEvaluatorAssignments({
          prisma,
          projectId,
          evaluatorIds: [firstEvaluator.id, secondEvaluator.id],
        }),
      ).resolves.toEqual({ [firstEvaluator.id]: 2 });
    });

    it("returns empty counts for an empty evaluator selection", async () => {
      await expect(
        assignmentRepository.countEvaluatorAssignments({
          prisma,
          projectId,
          evaluatorIds: [],
        }),
      ).resolves.toEqual({});
    });
  });
});
