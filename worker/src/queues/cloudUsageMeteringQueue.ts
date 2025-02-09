import { Processor } from "bullmq";
import {
  CloudUsageMeteringQueue,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { handleCloudUsageMeteringJob } from "../ee/cloudUsageMetering/handleCloudUsageMeteringJob";
import { cloudUsageMeteringDbCronJobName } from "../ee/cloudUsageMetering/constants";
import { CloudUsageMeteringDbCronJobStates } from "../ee/cloudUsageMetering/constants";
import { prisma } from "@langfuse/shared/src/db";

export const cloudUsageMeteringQueueProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.CloudUsageMeteringJob) {
    logger.info("Executing Cloud Usage Metering Job", job.data);
    try {
      return await handleCloudUsageMeteringJob(job);
    } catch (error) {
      logger.error("Error executing Cloud Usage Metering Job", error);
      // adding another job to the queue to process again.
      await prisma.cronJobs.update({
        where: {
          name: cloudUsageMeteringDbCronJobName,
        },
        data: {
          state: CloudUsageMeteringDbCronJobStates.Queued,
          jobStartedAt: null,
        },
      });
      await CloudUsageMeteringQueue.getInstance()?.add(
        QueueJobs.CloudUsageMeteringJob,
        {},
      );
      throw error;
    }
  }
};
