import { Job } from "bullmq";

import logger from "../logger";

export function logQueueWorkerError(job: Job | undefined, err: Error) {
  logger.error(
    err,
    `Queue Job ${job?.name} with id ${job?.id} failed with error
    ${err}`
  );
}
