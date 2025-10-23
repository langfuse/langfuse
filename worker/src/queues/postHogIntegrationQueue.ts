import { Processor } from "bullmq";
import {
  instrumentAsync,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { handlePostHogIntegrationSchedule } from "../features/posthog/handlePostHogIntegrationSchedule";
import { handlePostHogIntegrationProjectJob } from "../features/posthog/handlePostHogIntegrationProjectJob";
import { SpanKind } from "@opentelemetry/api";

export const postHogIntegrationProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.PostHogIntegrationJob) {
    logger.info("Executing PostHog Integration Job");
    try {
      return await handlePostHogIntegrationSchedule();
    } catch (error) {
      logger.error("Error executing PostHogIntegrationJob", error);
      throw error;
    }
  }
};

export const postHogIntegrationProcessingProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.PostHogIntegrationProcessingJob) {
    return await instrumentAsync(
      {
        name: "process posthog-integration-project",
        startNewTrace: true,
        spanKind: SpanKind.CONSUMER,
      },
      async () => {
        try {
          return await handlePostHogIntegrationProjectJob(job);
        } catch (error) {
          logger.error(
            "Error executing PostHogIntegrationProcessingJob",
            error,
          );
          throw error;
        }
      },
    );
  }
};
