import type * as PrismaClientModule from "@prisma/client";
import type { Mock } from "vitest";

vi.mock("@langfuse/shared/src/db", async () => {
  const { EvalTemplateType, JobConfigState } =
    await vi.importActual<typeof PrismaClientModule>("@prisma/client");
  return {
    EvalTemplateType,
    JobConfigState,
    prisma: {
      evaluationRule: {
        count: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      evaluator: { findFirst: vi.fn() },
    },
  };
});

import { prisma } from "@langfuse/shared/src/db";
import { countActiveEvaluationRules } from "@/src/features/evals/v2/server/rules/ruleErrors";
import {
  findPublicV2EvaluatorById,
  findPublicV2EvaluatorInFamily,
  findPublicV2EvaluationRule,
  listPublicEvaluationRulePage,
} from "@/src/features/evals/server/unstable-public-api/queries";

describe("unstable public eval queries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists rules exclusively from evaluation_rules", async () => {
    (prisma.evaluationRule.findMany as Mock).mockResolvedValue([
      { id: "rule" },
    ]);
    (prisma.evaluationRule.count as Mock).mockResolvedValue(1);

    await expect(
      listPublicEvaluationRulePage({
        projectId: "project",
        page: 1,
        limit: 20,
      }),
    ).resolves.toEqual({ records: [{ id: "rule" }], totalItems: 1 });

    expect(prisma.evaluationRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: "project",
          targetObject: {
            in: ["event", "experiment", "trace", "dataset"],
          },
        }),
      }),
    );
  });

  it("counts active rules exclusively from evaluation_rules", async () => {
    (prisma.evaluationRule.count as Mock).mockResolvedValue(4);

    await expect(
      countActiveEvaluationRules({ prisma, projectId: "project" }),
    ).resolves.toBe(4);
    expect(prisma.evaluationRule.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        targetObject: { in: ["event", "experiment"] },
      }),
    });
  });

  it("loads rules and assignments within the project", async () => {
    (prisma.evaluationRule.findFirst as Mock).mockResolvedValue({ id: "rule" });

    await expect(
      findPublicV2EvaluationRule({
        projectId: "project",
        evaluationRuleId: "rule",
      }),
    ).resolves.toEqual({ id: "rule" });
    expect(prisma.evaluationRule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rule", projectId: "project" } }),
    );
  });

  it("resolves project evaluators from the evaluators table", async () => {
    (prisma.evaluator.findFirst as Mock).mockResolvedValue({
      id: "evaluator",
      versions: [{ version: 2 }],
    });

    await expect(
      findPublicV2EvaluatorInFamily({
        projectId: "project",
        evaluator: {
          name: "Quality",
          type: "llm_as_judge",
        },
      }),
    ).resolves.toMatchObject({ id: "evaluator" });
    await expect(
      findPublicV2EvaluatorById({
        projectId: "project",
        evaluatorId: "evaluator",
      }),
    ).resolves.toMatchObject({ id: "evaluator" });
  });

  it("resolves a family within the project by name and type", async () => {
    (prisma.evaluator.findFirst as Mock).mockResolvedValue(null);

    await expect(
      findPublicV2EvaluatorInFamily({
        projectId: "project",
        evaluator: {
          name: "Missing",
          type: "llm_as_judge",
        },
      }),
    ).resolves.toBeNull();
    expect(prisma.evaluator.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: "project",
          name: "Missing",
        }),
      }),
    );
  });
});
