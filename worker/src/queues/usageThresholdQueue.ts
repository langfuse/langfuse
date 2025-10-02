import { Processor } from "bullmq";
import {
  UsageThresholdQueue,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { handleUsageThresholdJob } from "../ee/usageThresholds/handleUsageThresholdJob";
import { usageThresholdDbCronJobName } from "../ee/usageThresholds/constants";
import { UsageThresholdDbCronJobStates } from "../ee/usageThresholds/constants";
import { prisma } from "@langfuse/shared/src/db";

export const freeTierUsageThresholdQueueProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.FreeTierUsageThresholdJob) {
    logger.info("Executing Free Tier Usage Threshold Job", job.data);
    try {
      return await handleUsageThresholdJob(job);
    } catch (error) {
      logger.error("Error executing Free Tier Usage Threshold Job", error);
      // Reset DB state and re-queue job on error
      await prisma.cronJobs.update({
        where: {
          name: usageThresholdDbCronJobName,
        },
        data: {
          state: UsageThresholdDbCronJobStates.Queued,
          jobStartedAt: null,
        },
      });
      await UsageThresholdQueue.getInstance()?.add(
        QueueJobs.FreeTierUsageThresholdJob,
        {},
      );
      throw error;
    }
  }
};
