import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EvalTemplateType, JobConfigState } from "../../db";
import { EvalTargetObject } from "../../features/evals/types";
import { listRunnableScoreResultEvaluationRules } from "./evaluation-rules";

const findMany = vi.fn();
const prisma = {
  evaluationRule: { findMany },
} as unknown as PrismaClient;

describe("listRunnableScoreResultEvaluationRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
  });

  it("queries runnable rules independently for each trigger evaluator", async () => {
    await listRunnableScoreResultEvaluationRules({
      prisma,
      projectId: "project-1",
      triggerEvaluatorId: "evaluator-without-rules",
    });
    await listRunnableScoreResultEvaluationRules({
      prisma,
      projectId: "project-1",
      triggerEvaluatorId: "evaluator-with-rules",
    });

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: {
        projectId: "project-1",
        targetObject: EvalTargetObject.SCORE_RESULT,
        triggerEvaluatorId: "evaluator-with-rules",
        ruleInvalidReason: null,
        status: JobConfigState.ACTIVE,
        assignments: {
          some: {
            projectId: "project-1",
            evaluator: {
              blockedAt: null,
              type: {
                in: [
                  EvalTemplateType.LLM_AS_JUDGE,
                  EvalTemplateType.CODE,
                  EvalTemplateType.DECISION_MODEL,
                ],
              },
            },
          },
        },
      },
      select: expect.objectContaining({
        id: true,
        assignments: expect.objectContaining({
          where: expect.objectContaining({
            projectId: "project-1",
          }),
        }),
      }),
    });
  });
});
