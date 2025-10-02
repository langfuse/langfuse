import { Processor } from "bullmq";
import {
  CloudFreeTierUsageThresholdQueue,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { handleCloudFreeTierUsageThresholdJob } from "../ee/usageThresholds/handleCloudFreeTierUsageThresholdJob";
import { usageThresholdDbCronJobName } from "../ee/usageThresholds/constants";
import { UsageThresholdDbCronJobStates } from "../ee/usageThresholds/constants";
import { prisma } from "@langfuse/shared/src/db";

export const cloudFreeTierUsageThresholdQueueProcessor: Processor = async (
  job,
) => {
  if (job.name === QueueJobs.CloudFreeTierUsageThresholdJob) {
    logger.info("Executing Free Tier Usage Threshold Job", job.data);
    try {
      return await handleCloudFreeTierUsageThresholdJob(job);
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
      await CloudFreeTierUsageThresholdQueue.getInstance()?.add(
        QueueJobs.CloudFreeTierUsageThresholdJob,
        {},
      );
      throw error;
    }
  }
};
