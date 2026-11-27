import { Processor } from "bullmq";
import { logger, QueueJobs } from "@langfuse/shared/src/server";
import { handleCloudSpendAlertJob } from "../ee/cloudSpendAlerts/handleCloudSpendAlertJob";
import { handleCloudSpendAlertFanOutJob } from "../ee/cloudSpendAlerts/handleCloudSpendAlertFanOutJob";

export const cloudSpendAlertQueueProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.CloudSpendAlertJob) {
    logger.info("Executing Cloud Spend Alert Job", job.data);
    return await handleCloudSpendAlertJob(job);
  }
  if (job.name === QueueJobs.CloudSpendAlertFanOutJob) {
    logger.info("Executing Cloud Spend Alert Fan Out Job");
    return await handleCloudSpendAlertFanOutJob();
  }
};
