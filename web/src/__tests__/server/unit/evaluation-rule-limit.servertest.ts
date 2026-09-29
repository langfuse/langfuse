import { describe, expect, it, vi } from "vitest";
import {
  ActiveEvaluationRuleLimitError,
  MAX_ACTIVE_EVALUATION_RULES,
  assertActiveRuleLimitNotExceeded,
  countActiveEvaluationRules,
} from "@/src/features/evals/v2/server/rules/ruleErrors";

function prismaWithActiveCount(activeCount: number) {
  const count = vi.fn().mockResolvedValue(activeCount);
  return {
    prisma: { evaluationRule: { count } } as unknown as Parameters<
      typeof assertActiveRuleLimitNotExceeded
    >[0]["prisma"],
    count,
  };
}

describe("active evaluation rule limit", () => {
  it("counts only active rules on the writable targets", async () => {
    const { prisma, count } = prismaWithActiveCount(7);

    await expect(
      countActiveEvaluationRules({ prisma, projectId: "project" }),
    ).resolves.toBe(7);
    expect(count).toHaveBeenCalledWith({
      where: {
        projectId: "project",
        targetObject: { in: ["event", "experiment"] },
        status: "ACTIVE",
      },
    });
  });

  it("allows activating up to the cap", async () => {
    const { prisma } = prismaWithActiveCount(MAX_ACTIVE_EVALUATION_RULES - 1);

    await expect(
      assertActiveRuleLimitNotExceeded({
        prisma,
        projectId: "project",
        additionalActiveRules: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects activating past the cap", async () => {
    const { prisma } = prismaWithActiveCount(MAX_ACTIVE_EVALUATION_RULES);

    await expect(
      assertActiveRuleLimitNotExceeded({
        prisma,
        projectId: "project",
        additionalActiveRules: 1,
      }),
    ).rejects.toBeInstanceOf(ActiveEvaluationRuleLimitError);
  });

  it("accounts for bulk activation instead of only the next single rule", async () => {
    const { prisma } = prismaWithActiveCount(MAX_ACTIVE_EVALUATION_RULES - 2);

    await expect(
      assertActiveRuleLimitNotExceeded({
        prisma,
        projectId: "project",
        additionalActiveRules: 3,
      }),
    ).rejects.toBeInstanceOf(ActiveEvaluationRuleLimitError);
  });

  it("skips the query when nothing is being activated", async () => {
    const { prisma, count } = prismaWithActiveCount(
      MAX_ACTIVE_EVALUATION_RULES,
    );

    await expect(
      assertActiveRuleLimitNotExceeded({
        prisma,
        projectId: "project",
        additionalActiveRules: 0,
      }),
    ).resolves.toBeUndefined();
    expect(count).not.toHaveBeenCalled();
  });
});
