import { Processor } from "bullmq";
import { logger, QueueJobs } from "@langfuse/shared/src/server";
import { handlePostHogIntegrationSchedule } from "../ee/integrations/posthog/handlePostHogIntegrationSchedule";
import { handlePostHogIntegrationProjectJob } from "../ee/integrations/posthog/handlePostHogIntegrationProjectJob";

export const postHogIntegrationProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.PostHogIntegrationJob) {
    logger.info("Executing PostHog Integration Job");
    try {
      return await handlePostHogIntegrationSchedule(job);
    } catch (error) {
      logger.error("Error executing PostHogIntegrationJob", error);
      throw error;
    }
  }
};

export const postHogIntegrationProcessingProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.PostHogIntegrationProcessingJob) {
    try {
      return await handlePostHogIntegrationProjectJob(job);
    } catch (error) {
      logger.error("Error executing PostHogIntegrationProcessingJob", error);
      throw error;
    }
  }
};
