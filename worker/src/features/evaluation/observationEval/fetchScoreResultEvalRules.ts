import { EvalTargetObject, ScoreResultTriggerSchema } from "@langfuse/shared";
import {
  EvalTemplateType,
  JobConfigState,
  prisma,
} from "@langfuse/shared/src/db";
import type { ScoreResultEvalRule } from "./types";

const runnableEvaluatorTypes = [
  EvalTemplateType.LLM_AS_JUDGE,
  EvalTemplateType.CODE,
  EvalTemplateType.DECISION_MODEL,
];

export async function fetchScoreResultEvalRules(params: {
  projectId: string;
  evaluatorId: string;
}): Promise<ScoreResultEvalRule[]> {
  const rules = await prisma.evaluationRule.findMany({
    where: {
      projectId: params.projectId,
      targetObject: EvalTargetObject.SCORE_RESULT,
      triggerEvaluatorId: params.evaluatorId,
      ruleInvalidReason: null,
      status: JobConfigState.ACTIVE,
      assignments: {
        some: {
          projectId: params.projectId,
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
          projectId: params.projectId,
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

  return rules.map((rule) => ({
    id: rule.id,
    ruleId: rule.id,
    projectId: rule.projectId,
    filter: [],
    sampling: rule.sampling,
    targetObject: EvalTargetObject.EVENT,
    status: rule.status,
    assignments: rule.assignments,
    scoreResultTrigger: ScoreResultTriggerSchema.parse({
      evaluatorId: params.evaluatorId,
      predicates: rule.filter,
    }),
  }));
}
