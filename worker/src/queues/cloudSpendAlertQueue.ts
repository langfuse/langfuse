import { Processor } from "bullmq";
import {
  CloudSpendAlertQueue,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { handleCloudSpendAlertJob } from "../ee/cloudSpendAlerts/handleCloudSpendAlertJob";
import { cloudSpendAlertDbCronJobName } from "../ee/cloudSpendAlerts/constants";
import { CloudSpendAlertDbCronJobStates } from "../ee/cloudSpendAlerts/constants";
import { prisma } from "@langfuse/shared/src/db";

export const cloudSpendAlertQueueProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.CloudSpendAlertJob) {
    logger.info("Executing Cloud Spend Alert Job", job.data);
    try {
      return await handleCloudSpendAlertJob(job);
    } catch (error) {
      logger.error("Error executing Cloud Spend Alert Job", error);
      // Reset job state for retry
      await prisma.cronJobs.update({
        where: {
          name: cloudSpendAlertDbCronJobName,
        },
        data: {
          state: CloudSpendAlertDbCronJobStates.Queued,
          jobStartedAt: null,
        },
      });
      await CloudSpendAlertQueue.getInstance()?.add(
        QueueJobs.CloudSpendAlertJob,
        {},
      );
      throw error;
    }
  }
};