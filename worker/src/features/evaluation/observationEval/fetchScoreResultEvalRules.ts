import { EvalTargetObject, ScoreResultTriggerSchema } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { listRunnableScoreResultEvaluationRules } from "@langfuse/shared/src/server";
import type { ScoreResultEvalRule } from "./types";

export async function fetchScoreResultEvalRules(params: {
  projectId: string;
  evaluatorId: string;
}): Promise<ScoreResultEvalRule[]> {
  const rules = await listRunnableScoreResultEvaluationRules({
    prisma,
    projectId: params.projectId,
    triggerEvaluatorId: params.evaluatorId,
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
