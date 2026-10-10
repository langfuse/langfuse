import {
  matchesScoreResultTrigger,
  type ObservationForEval,
} from "@langfuse/shared";
import type { CodeEvalScoreWithName } from "@langfuse/shared/src/server";
import { scheduleObservationEvals } from "./scheduleObservationEvals";
import type {
  ObservationEvalSchedulerDeps,
  ScoreResultEvalRule,
} from "./types";

export async function scheduleScoreResultEvals(params: {
  observation: ObservationForEval;
  scores: CodeEvalScoreWithName[];
  rules: ScoreResultEvalRule[];
  upstreamJobExecutionId: string;
  schedulerDeps: ObservationEvalSchedulerDeps;
}) {
  const matchingRules = params.rules.filter((rule) =>
    matchesScoreResultTrigger(rule.scoreResultTrigger, params.scores),
  );

  await scheduleObservationEvals({
    observation: params.observation,
    configs: matchingRules,
    schedulerDeps: params.schedulerDeps,
    executionScopeId: params.upstreamJobExecutionId,
    preserveExistingJobExecution: true,
  });
}
