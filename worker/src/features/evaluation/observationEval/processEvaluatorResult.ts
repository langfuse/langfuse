import {
  EvaluatorResultQueueEventSchema,
  type EvaluatorResultQueueEventType,
} from "@langfuse/shared/src/server";
import { observationForEvalSchema } from "@langfuse/shared";

import { getEvalS3StorageClient } from "../s3StorageClient";
import { createObservationEvalSchedulerDeps } from "./createSchedulerDeps";
import { fetchScoreResultEvalRules } from "./fetchScoreResultEvalRules";
import { scheduleScoreResultEvals } from "./scheduleScoreResultEvals";

type ProcessEvaluatorResultDeps = {
  downloadObservation: (path: string) => Promise<string>;
  fetchRules: typeof fetchScoreResultEvalRules;
  scheduleEvals: typeof scheduleScoreResultEvals;
};

const productionDeps: ProcessEvaluatorResultDeps = {
  downloadObservation: async (path) => getEvalS3StorageClient().download(path),
  fetchRules: fetchScoreResultEvalRules,
  scheduleEvals: scheduleScoreResultEvals,
};

export async function processEvaluatorResult(
  input: EvaluatorResultQueueEventType,
  deps: ProcessEvaluatorResultDeps = productionDeps,
) {
  const event = EvaluatorResultQueueEventSchema.parse(input);
  const rules = await deps.fetchRules({
    projectId: event.projectId,
    evaluatorId: event.evaluatorId,
  });
  if (rules.length === 0) return;

  const observation = observationForEvalSchema.parse(
    JSON.parse(await deps.downloadObservation(event.observationS3Path)),
  );
  await deps.scheduleEvals({
    observation,
    scores: event.scores,
    rules,
    upstreamJobExecutionId: event.upstreamJobExecutionId,
    schedulerDeps: createObservationEvalSchedulerDeps(),
  });
}
