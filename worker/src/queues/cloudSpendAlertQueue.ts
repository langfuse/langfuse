import { Processor } from "bullmq";
import { logger, QueueJobs } from "@langfuse/shared/src/server";
import { handleCloudSpendAlertJob } from "../ee/cloudSpendAlerts/handleCloudSpendAlertJob";

export const cloudSpendAlertQueueProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.CloudSpendAlertJob) {
    logger.info("Executing Cloud Spend Alert Job", job.data);
    return await handleCloudSpendAlertJob(job);
  }
};
