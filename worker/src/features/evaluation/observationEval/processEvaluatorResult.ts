import type { ObservationForEval } from "@langfuse/shared";
import type { CodeEvalScoreWithName } from "@langfuse/shared/src/server";

import { createObservationEvalSchedulerDeps } from "./createSchedulerDeps";
import { fetchScoreResultEvalRules } from "./fetchScoreResultEvalRules";
import { scheduleScoreResultEvals } from "./scheduleScoreResultEvals";

export async function processEvaluatorResult(input: {
  projectId: string;
  evaluatorId: string;
  upstreamJobExecutionId: string;
  observation: ObservationForEval;
  scores: CodeEvalScoreWithName[];
}) {
  const rules = await fetchScoreResultEvalRules({
    projectId: input.projectId,
    evaluatorId: input.evaluatorId,
  });
  if (rules.length === 0) return;

  await scheduleScoreResultEvals({
    observation: input.observation,
    scores: input.scores,
    rules,
    upstreamJobExecutionId: input.upstreamJobExecutionId,
    schedulerDeps: createObservationEvalSchedulerDeps(),
  });
}
