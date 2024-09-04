import { Job } from "bullmq";

import { logger } from "@langfuse/shared/src/server";
export function logQueueWorkerError(job: Job | undefined, err: Error) {
  logger.error(
    `Queue Job ${job?.name} with id ${job?.id} failed with error`,
    err,
  );
}
