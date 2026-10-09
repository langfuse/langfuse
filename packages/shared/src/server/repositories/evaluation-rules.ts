import type { PrismaClient } from "@prisma/client";

import { EvalTemplateType, JobConfigState } from "../../db";
import { EvalTargetObject } from "../../features/evals/types";

const runnableEvaluatorTypes = [
  EvalTemplateType.LLM_AS_JUDGE,
  EvalTemplateType.CODE,
  EvalTemplateType.DECISION_MODEL,
];

export function listRunnableScoreResultEvaluationRules({
  prisma,
  projectId,
  triggerEvaluatorId,
}: {
  prisma: PrismaClient;
  projectId: string;
  triggerEvaluatorId: string;
}) {
  return prisma.evaluationRule.findMany({
    where: {
      projectId,
      targetObject: EvalTargetObject.SCORE_RESULT,
      triggerEvaluatorId,
      ruleInvalidReason: null,
      status: JobConfigState.ACTIVE,
      assignments: {
        some: {
          projectId,
          evaluator: { blockedAt: null, type: { in: runnableEvaluatorTypes } },
        },
      },
    },
    select: {
      id: true,
      projectId: true,
      filter: true,
      sampling: true,
      status: true,
      assignments: {
        where: {
          projectId,
          evaluator: { blockedAt: null, type: { in: runnableEvaluatorTypes } },
        },
        select: {
          id: true,
          evaluatorId: true,
          variableMapping: true,
          evaluator: {
            select: {
              id: true,
              projectId: true,
              type: true,
            },
          },
        },
      },
    },
  });
}
