import type { ObservationForEval } from "@langfuse/shared";
import type { CodeEvalScoreWithName } from "@langfuse/shared/src/server";

import { createObservationEvalSchedulerDeps } from "./createSchedulerDeps";
import { fetchScoreResultEvalRules } from "./fetchScoreResultEvalRules";
import { scheduleScoreResultEvals } from "./scheduleScoreResultEvals";

type ProcessEvaluatorResultDeps = {
  fetchRules: typeof fetchScoreResultEvalRules;
  scheduleEvals: (params: {
    observation: ObservationForEval;
    scores: CodeEvalScoreWithName[];
    rules: Awaited<ReturnType<typeof fetchScoreResultEvalRules>>;
    upstreamJobExecutionId: string;
  }) => Promise<void>;
};

const productionDeps: ProcessEvaluatorResultDeps = {
  fetchRules: fetchScoreResultEvalRules,
  scheduleEvals: async (params) =>
    scheduleScoreResultEvals({
      ...params,
      schedulerDeps: createObservationEvalSchedulerDeps(),
    }),
};

export async function processEvaluatorResult(
  input: {
    projectId: string;
    evaluatorId: string;
    upstreamJobExecutionId: string;
    observation: ObservationForEval;
    scores: CodeEvalScoreWithName[];
  },
  deps: ProcessEvaluatorResultDeps = productionDeps,
) {
  const rules = await deps.fetchRules({
    projectId: input.projectId,
    evaluatorId: input.evaluatorId,
  });
  if (rules.length === 0) return;

  await deps.scheduleEvals({
    observation: input.observation,
    scores: input.scores,
    rules,
    upstreamJobExecutionId: input.upstreamJobExecutionId,
  });
}
