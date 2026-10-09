import { type Job } from "bullmq";
import { QueueName, type TQueueJobTypes } from "@langfuse/shared/src/server";

import { processEvaluatorResult } from "../features/evaluation/observationEval/processEvaluatorResult";

export async function evaluatorResultQueueProcessor(
  job: Job<TQueueJobTypes[QueueName.EvaluatorResult]>,
) {
  await processEvaluatorResult(job.data.payload);
}
