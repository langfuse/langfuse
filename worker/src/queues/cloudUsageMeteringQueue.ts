import { Processor } from "bullmq";
import {
  CloudUsageMeteringQueue,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { handleCloudUsageMeteringJob } from "../ee/cloudUsageMetering/handleCloudUsageMeteringJob";

export const cloudUsageMeteringQueueProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.CloudUsageMeteringJob) {
    logger.info("Executing Cloud Usage Metering Job", job.data);
    try {
      return await handleCloudUsageMeteringJob(job);
    } catch (error) {
      logger.error("Error executing Cloud Usage Metering Job", error);
      // adding another job to the queue to process again.
      await CloudUsageMeteringQueue.getInstance()?.add(
        QueueJobs.CloudUsageMeteringJob,
        {},
      );
      throw error;
    }
  }
};
