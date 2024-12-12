import { Job } from "bullmq";
import {
  QueueName,
  TQueueJobTypes,
  logger,
  traceException,
} from "@langfuse/shared/src/server";
import { createExperimentJob } from "../ee/experiments/experimentService";
import {
  ForbiddenError,
  InvalidRequestError,
  LangfuseNotFoundError,
} from "@langfuse/shared";

export const experimentCreateQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.ExperimentCreate]>,
) => {
  try {
    logger.info("Starting to process experiment create job", {
      jobId: job.id,
      attempt: job.attemptsMade,
      data: job.data,
    });
    await createExperimentJob({
      event: job.data.payload,
    });
    return true;
  } catch (e) {
    if (
      e instanceof ForbiddenError ||
      e instanceof InvalidRequestError ||
      e instanceof LangfuseNotFoundError
    ) {
      logger.info("Failed to process experiment create job", e);
      // LFE-3174: improve error reporting to the user for experiment create job
      return;
    }

    logger.error("Failed to process experiment create job", e);
    traceException(e);
    throw e;
  }
};
