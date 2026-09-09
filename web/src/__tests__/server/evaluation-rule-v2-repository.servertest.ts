import { randomUUID } from "node:crypto";
import { EvalTargetObject, type FilterState } from "@langfuse/shared";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as ruleRepository from "@/src/features/evals/v2/server/rules/ruleRepository";
import { filtersMatch } from "@/src/features/evals/v2/server/rules/ruleFilterMatching";
import { RuleService } from "@/src/features/evals/v2/server/rules/ruleService";

const orgIds: string[] = [];
let projectId = "";
let otherProjectId = "";
let creatorUserId = "";

beforeAll(async () => {
  const [first, second, creator] = await Promise.all([
    createOrgProjectAndApiKey(),
    createOrgProjectAndApiKey(),
    prisma.user.create({
      data: {
        name: "Rule creator",
        email: `${randomUUID()}@example.com`,
      },
    }),
  ]);
  projectId = first.project.id;
  otherProjectId = second.project.id;
  creatorUserId = creator.id;
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
  await prisma.user.delete({ where: { id: creatorUserId } });
});

function createEvaluator(targetProjectId = projectId) {
  return prisma.evaluator.create({
    data: {
      projectId: targetProjectId,
      name: `evaluator-${randomUUID()}`,
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

async function createRule({
  targetProjectId = projectId,
  name = `rule-${randomUUID()}`,
  evaluatorId,
  evaluatorIds,
  filter = [],
  createdByUserId = null,
}: {
  targetProjectId?: string;
  name?: string;
  evaluatorId?: string;
  evaluatorIds?: string[];
  filter?: Parameters<typeof ruleRepository.createRule>[0]["input"]["filter"];
  createdByUserId?: string | null;
} = {}) {
  const assignedEvaluatorIds =
    evaluatorIds ?? (evaluatorId ? [evaluatorId] : []);
  return ruleRepository.createRule({
    prisma,
    input: {
      projectId: targetProjectId,
      name,
      targetObject: EvalTargetObject.EVENT,
      enabled: true,
      filter,
      sampling: 1,
      evaluatorAssignments: assignedEvaluatorIds.map((assignedEvaluatorId) => ({
        evaluatorId: assignedEvaluatorId,
        variableMapping: null,
      })),
    },
    createdByUserId,
  });
}

describe("evaluation rule v2 repository", () => {
  describe("listRules", () => {
    it("returns an empty list", async () => {
      await expect(
        ruleRepository.listRules({
          prisma,
          input: { projectId, page: 1, limit: 50 },
        }),
      ).resolves.toEqual({ rules: [], totalItems: 0 });
    });

    it("returns matching project rules with their list data", async () => {
      const evaluator = await createEvaluator();
      const matching = await createRule({
        name: "Quality production rule",
        evaluatorId: evaluator.id,
      });
      await Promise.all([
        createRule({ name: "Unrelated inactive rule" }).then((rule) =>
          ruleRepository.setRuleStatus({
            prisma,
            projectId,
            ruleIds: [rule.id],
            enabled: false,
          }),
        ),
        createRule({
          targetProjectId: otherProjectId,
          name: "Other project production rule",
        }),
      ]);

      const result = await ruleRepository.listRules({
        prisma,
        input: {
          projectId,
          page: 1,
          limit: 50,
          search: "PRODUCTION",
          enabled: true,
        },
      });

      expect(result).toMatchObject({
        rules: [
          {
            id: matching.id,
            assignments: [
              {
                evaluatorId: evaluator.id,
                evaluator: {
                  id: evaluator.id,
                  versions: [{ version: 1 }],
                },
              },
            ],
          },
        ],
        totalItems: 1,
      });
    });

    it("uses stable creation order by default and supports explicit sorting", async () => {
      const [older, newer] = await Promise.all([
        createRule({ name: "Older" }),
        createRule({ name: "Newer" }),
      ]);
      await Promise.all([
        prisma.evaluationRule.update({
          where: { id: older.id },
          data: {
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-03T00:00:00.000Z"),
          },
        }),
        prisma.evaluationRule.update({
          where: { id: newer.id },
          data: {
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
            updatedAt: new Date("2026-01-02T00:00:00.000Z"),
          },
        }),
      ]);

      await expect(
        ruleRepository.listRules({
          prisma,
          input: { projectId, page: 1, limit: 1 },
        }),
      ).resolves.toEqual({
        rules: [expect.objectContaining({ id: newer.id })],
        totalItems: 2,
      });
      await expect(
        ruleRepository.listRules({
          prisma,
          input: { projectId, page: 2, limit: 1 },
        }),
      ).resolves.toEqual({
        rules: [expect.objectContaining({ id: older.id })],
        totalItems: 2,
      });
      await expect(
        ruleRepository.listRules({
          prisma,
          input: {
            projectId,
            page: 1,
            limit: 2,
            orderBy: { column: "updatedAt", order: "DESC" },
          },
        }),
      ).resolves.toEqual({
        rules: [
          expect.objectContaining({ id: older.id }),
          expect.objectContaining({ id: newer.id }),
        ],
        totalItems: 2,
      });
    });

    it("filters rules by name, creator, and enabled state", async () => {
      const matching = await createRule({
        name: "Production quality rule",
        createdByUserId: creatorUserId,
      });
      await Promise.all([
        createRule({ name: "Production API rule" }),
        createRule({
          name: "Inactive quality rule",
          createdByUserId: creatorUserId,
        }).then((rule) =>
          ruleRepository.setRuleStatus({
            prisma,
            projectId,
            ruleIds: [rule.id],
            enabled: false,
          }),
        ),
        createRule({
          targetProjectId: otherProjectId,
          name: "Production quality rule",
          createdByUserId: creatorUserId,
        }),
      ]);

      const result = await ruleRepository.listRules({
        prisma,
        input: {
          projectId,
          page: 1,
          limit: 50,
          filter: [
            {
              column: "name",
              type: "string",
              operator: "contains",
              value: "quality",
            },
            {
              column: "creator",
              type: "string",
              operator: "contains",
              value: "Rule creator",
            },
            { column: "enabled", type: "boolean", operator: "=", value: true },
          ],
        },
      });

      expect(result).toEqual({
        rules: [expect.objectContaining({ id: matching.id })],
        totalItems: 1,
      });
    });

    it("filters rule names and creators using selector values", async () => {
      const matching = await createRule({
        name: "Selected rule",
        createdByUserId: creatorUserId,
      });
      await Promise.all([
        createRule({ name: "Other rule", createdByUserId: creatorUserId }),
        createRule({ name: "Selected rule" }),
      ]);

      const result = await ruleRepository.listRules({
        prisma,
        input: {
          projectId,
          page: 1,
          limit: 50,
          filter: [
            {
              column: "name",
              type: "stringOptions",
              operator: "any of",
              value: ["Selected rule"],
            },
            {
              column: "creator",
              type: "stringOptions",
              operator: "any of",
              value: ["Rule creator"],
            },
          ],
        },
      });

      expect(result).toEqual({
        rules: [expect.objectContaining({ id: matching.id })],
        totalItems: 1,
      });
    });
  });

  describe("listRuleFilterOptions", () => {
    it("returns distinct project-scoped names, creators, and upgrade availability", async () => {
      await Promise.all([
        createRule({ name: "Alpha rule", createdByUserId: creatorUserId }),
        createRule({ name: "Alpha rule" }),
        createRule({ name: "Beta rule" }),
        createRule({
          targetProjectId: otherProjectId,
          name: "Foreign rule",
        }),
      ]);

      await expect(
        ruleRepository.listRuleFilterOptions({ prisma, projectId }),
      ).resolves.toEqual({
        name: ["Alpha rule", "Beta rule"],
        creator: ["API", "Rule creator"],
        hasUpgradeRequired: false,
      });

      await prisma.evaluationRule.updateMany({
        where: { projectId, name: "Beta rule" },
        data: { targetObject: EvalTargetObject.TRACE },
      });

      await expect(
        ruleRepository.listRuleFilterOptions({ prisma, projectId }),
      ).resolves.toMatchObject({ hasUpgradeRequired: true });
    });
  });

  describe("findRule", () => {
    it("returns the scoped rule and null for unavailable rules", async () => {
      const rule = await createRule();

      await expect(
        ruleRepository.findRule({ prisma, projectId, ruleId: rule.id }),
      ).resolves.toMatchObject({ id: rule.id });
      await expect(
        ruleRepository.findRule({
          prisma,
          projectId: otherProjectId,
          ruleId: rule.id,
        }),
      ).resolves.toBeNull();
      await expect(
        ruleRepository.findRule({
          prisma,
          projectId,
          ruleId: "missing-rule",
        }),
      ).resolves.toBeNull();
    });
  });

  describe("createRule", () => {
    it("persists fixed observation-rule fields and assignments", async () => {
      const evaluator = await createEvaluator();

      const rule = await createRule({ evaluatorId: evaluator.id });

      expect(rule).toMatchObject({
        projectId,
        status: "ACTIVE",
        targetObject: "event",
        timeScope: ["NEW"],
        delay: 0,
        assignments: [{ evaluatorId: evaluator.id, variableMapping: null }],
      });
    });
  });

  describe("updateRule", () => {
    it("updates provided fields and preserves omitted fields", async () => {
      const rule = await createRule({ name: "Original" });

      const updated = await ruleRepository.updateRule({
        prisma,
        input: { projectId, ruleId: rule.id, name: "Updated" },
      });

      expect(updated).toMatchObject({
        name: "Updated",
        status: "ACTIVE",
      });
      expect(updated.sampling.toNumber()).toBe(1);
    });
  });

  describe("setRuleStatus", () => {
    it("maps enabled to the persisted status", async () => {
      const rule = await createRule();

      await expect(
        ruleRepository.setRuleStatus({
          prisma,
          projectId,
          ruleIds: [rule.id],
          enabled: false,
        }),
      ).resolves.toEqual({ count: 1 });
      await expect(
        ruleRepository.setRuleStatus({
          prisma,
          projectId,
          ruleIds: [rule.id],
          enabled: true,
        }),
      ).resolves.toEqual({ count: 1 });
      await expect(
        prisma.evaluationRule.findUnique({ where: { id: rule.id } }),
      ).resolves.toMatchObject({ status: "ACTIVE" });
    });
  });

  describe("deleteRule", () => {
    it("returns false for unavailable rules and deletes a scoped rule", async () => {
      const rule = await createRule();

      await expect(
        ruleRepository.deleteRule({
          prisma,
          projectId: otherProjectId,
          ruleId: rule.id,
        }),
      ).resolves.toBe(false);
      await expect(
        ruleRepository.deleteRule({ prisma, projectId, ruleId: rule.id }),
      ).resolves.toBe(true);
    });
  });

  describe("listSelectedRuleIds", () => {
    it("selects explicit and filtered rule IDs within the project", async () => {
      const [matching, unrelated, foreign] = await Promise.all([
        createRule({ name: "Production match" }),
        createRule({ name: "Unrelated" }),
        createRule({
          targetProjectId: otherProjectId,
          name: "Production foreign",
        }),
      ]);

      await expect(
        ruleRepository.listSelectedRuleIds({
          prisma,
          input: { projectId, ruleIds: [matching.id, foreign.id] },
        }),
      ).resolves.toEqual([matching.id]);
      await expect(
        ruleRepository.listSelectedRuleIds({
          prisma,
          input: {
            projectId,
            isBatchAction: true,
            filter: [
              {
                column: "name",
                type: "string",
                operator: "contains",
                value: "production",
              },
            ],
          },
        }),
      ).resolves.toEqual([matching.id]);
      await expect(
        ruleRepository.listSelectedRuleIds({
          prisma,
          input: { projectId, ruleIds: [unrelated.id] },
        }),
      ).resolves.toEqual([unrelated.id]);
    });
  });

  describe("replaceAssignments", () => {
    it("replaces the complete assignment set", async () => {
      const [first, second] = await Promise.all([
        createEvaluator(),
        createEvaluator(),
      ]);
      const rule = await createRule({ evaluatorId: first.id });

      await ruleRepository.replaceAssignments({
        prisma,
        projectId,
        ruleId: rule.id,
        assignments: [{ evaluatorId: second.id, variableMapping: null }],
      });

      await expect(
        prisma.evaluationRuleEvaluatorAssignment.findMany({
          where: { evaluationRuleId: rule.id },
          select: { evaluatorId: true, variableMapping: true },
        }),
      ).resolves.toEqual([{ evaluatorId: second.id, variableMapping: null }]);
    });
  });

  describe("attachEvaluator", () => {
    it("persists an assignment", async () => {
      const evaluator = await createEvaluator();
      const rule = await createRule();

      await ruleRepository.attachEvaluator({
        prisma,
        projectId,
        ruleId: rule.id,
        assignment: { evaluatorId: evaluator.id, variableMapping: null },
      });

      await expect(
        prisma.evaluationRuleEvaluatorAssignment.findUnique({
          where: {
            evaluationRuleId_evaluatorId: {
              evaluationRuleId: rule.id,
              evaluatorId: evaluator.id,
            },
          },
        }),
      ).resolves.not.toBeNull();
    });
  });

  describe("detachEvaluator", () => {
    it("deletes an existing assignment and returns false when unavailable", async () => {
      const evaluator = await createEvaluator();
      const rule = await createRule({ evaluatorId: evaluator.id });

      await expect(
        ruleRepository.detachEvaluator({
          prisma,
          projectId,
          ruleId: rule.id,
          evaluatorId: evaluator.id,
        }),
      ).resolves.toBe(true);
      await expect(
        ruleRepository.detachEvaluator({
          prisma,
          projectId,
          ruleId: rule.id,
          evaluatorId: evaluator.id,
        }),
      ).resolves.toBe(false);
    });
  });

  describe("listReusableFilterCandidates", () => {
    it("returns at most the 20 newest candidate rules", async () => {
      const oldestRuleId = randomUUID();
      await prisma.evaluationRule.createMany({
        data: Array.from({ length: 21 }, (_, index) => ({
          id: index === 0 ? oldestRuleId : randomUUID(),
          projectId,
          name: `candidate-${index}`,
          status: "ACTIVE" as const,
          targetObject: EvalTargetObject.EVENT,
          filter: [],
          sampling: 1,
          delay: 0,
          timeScope: ["NEW"],
          updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, index)),
        })),
      });

      const candidates = await ruleRepository.listReusableFilterCandidates({
        prisma,
        projectId,
      });

      expect(candidates).toHaveLength(20);
      expect(candidates.map(({ id }) => id)).not.toContain(oldestRuleId);
    });
  });

  describe("RuleService.listReusableFilters", () => {
    it("groups equivalent modern rule filters and ranks only by distinct evaluator count, then updated time", async () => {
      const [
        firstEvaluator,
        secondEvaluator,
        thirdEvaluator,
        legacyEvaluator,
        foreignEvaluator,
      ] = await Promise.all([
        createEvaluator(),
        createEvaluator(),
        createEvaluator(),
        createEvaluator(),
        createEvaluator(otherProjectId),
      ]);
      const popularFilter = [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production", "staging"],
        },
      ] satisfies FilterState;
      const newerFilter = [
        {
          column: "type",
          type: "stringOptions",
          operator: "any of",
          value: ["GENERATION"],
        },
      ] satisfies FilterState;
      const olderFilter = [
        {
          column: "level",
          type: "stringOptions",
          operator: "any of",
          value: ["ERROR"],
        },
      ] satisfies FilterState;

      const [popularFirst, popularSecond, newer, older] = await Promise.all([
        createRule({
          evaluatorIds: [firstEvaluator.id, secondEvaluator.id],
          filter: [...popularFilter],
        }),
        // Same conditions and values in a different order. The repeated
        // evaluator counts once across the grouped filter preset.
        createRule({
          evaluatorIds: [
            secondEvaluator.id,
            thirdEvaluator.id,
            legacyEvaluator.id,
          ],
          filter: [
            {
              ...popularFilter[0],
              value: ["staging", "production"],
            },
          ],
        }),
        createRule({
          evaluatorId: firstEvaluator.id,
          filter: [...newerFilter],
        }),
        createRule({
          evaluatorId: secondEvaluator.id,
          filter: [...olderFilter],
        }),
      ]);
      const oldDate = new Date("2026-01-01T00:00:00.000Z");
      const newDate = new Date("2026-02-01T00:00:00.000Z");
      await Promise.all([
        prisma.evaluationRule.updateMany({
          where: { id: { in: [popularFirst.id, popularSecond.id, older.id] } },
          data: { updatedAt: oldDate },
        }),
        prisma.evaluationRule.update({
          where: { id: newer.id },
          data: { updatedAt: newDate },
        }),
        // Denormalized assignment ids are scoped explicitly: a foreign-project
        // evaluator attached to a current-project rule does not affect usage.
        prisma.evaluationRuleEvaluatorAssignment.create({
          data: {
            projectId,
            evaluationRuleId: popularFirst.id,
            evaluatorId: foreignEvaluator.id,
            variableMapping: Prisma.DbNull,
          },
        }),
        // An evaluator with a legacy trace/dataset assignment is excluded from
        // usage counts, and the legacy rule never becomes a reusable preset.
        prisma.evaluationRule.create({
          data: {
            projectId,
            name: "Legacy trace rule",
            status: "ACTIVE",
            targetObject: EvalTargetObject.TRACE,
            filter: olderFilter,
            sampling: 1,
            delay: 0,
            timeScope: ["NEW"],
            assignments: {
              create: {
                projectId,
                evaluatorId: legacyEvaluator.id,
                variableMapping: Prisma.DbNull,
              },
            },
          },
        }),
        createRule({
          targetProjectId: otherProjectId,
          evaluatorId: foreignEvaluator.id,
          filter: [...newerFilter],
        }),
      ]);
      await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          createRule({
            filter: [
              {
                column: "environment",
                type: "stringOptions",
                operator: "any of",
                value: [`extra-${index}`],
              },
            ],
          }),
        ),
      );

      const result = await new RuleService(
        prisma,
        async () => undefined,
      ).listReusableFilters(projectId);

      expect(result).toHaveLength(10);
      expect(
        result.slice(0, 3).map(({ evaluatorCount }) => evaluatorCount),
      ).toEqual([3, 1, 1]);
      expect(filtersMatch(result[0]?.filter ?? [], [...popularFilter])).toBe(
        true,
      );
      expect(result[1]).toMatchObject({
        filter: [...newerFilter],
        updatedAt: newDate,
      });
      expect(result[2]).toMatchObject({
        filter: [...olderFilter],
        updatedAt: oldDate,
      });
    });
  });

  describe("countRulesForEvaluators", () => {
    it("returns project-scoped counts and omits evaluators without rules", async () => {
      const [firstEvaluator, secondEvaluator] = await Promise.all([
        createEvaluator(),
        createEvaluator(),
      ]);
      await Promise.all([
        createRule({ evaluatorId: firstEvaluator.id }),
        createRule({ evaluatorId: firstEvaluator.id }),
        createRule({
          targetProjectId: otherProjectId,
          evaluatorId: firstEvaluator.id,
        }),
      ]);

      await expect(
        ruleRepository.countRulesForEvaluators({
          prisma,
          projectId,
          evaluatorIds: [firstEvaluator.id, secondEvaluator.id],
        }),
      ).resolves.toEqual({ [firstEvaluator.id]: 2 });
    });

    it("returns empty counts for an empty evaluator selection", async () => {
      await expect(
        ruleRepository.countRulesForEvaluators({
          prisma,
          projectId,
          evaluatorIds: [],
        }),
      ).resolves.toEqual({});
    });
  });

  describe("listRulesForEvaluator", () => {
    it("returns an empty list", async () => {
      const evaluator = await createEvaluator();

      await expect(
        ruleRepository.listRulesForEvaluator({
          prisma,
          projectId,
          evaluatorId: evaluator.id,
        }),
      ).resolves.toEqual([]);
    });

    it("returns scoped rule assignments with response primitives", async () => {
      const evaluator = await createEvaluator();
      const rule = await createRule({ evaluatorId: evaluator.id });

      await expect(
        ruleRepository.listRulesForEvaluator({
          prisma,
          projectId,
          evaluatorId: evaluator.id,
        }),
      ).resolves.toEqual([
        expect.objectContaining({
          variableMapping: null,
          evaluationRule: expect.objectContaining({
            id: rule.id,
            enabled: true,
            sampling: 1,
          }),
        }),
      ]);
    });
  });
});
