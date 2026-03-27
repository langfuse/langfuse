import { Processor } from "bullmq";
import {
  instrumentAsync,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { handleKubitSchedule } from "../features/kubit/handleKubitSchedule";
import { handleKubitProjectJob } from "../features/kubit/handleKubitProjectJob";
import { SpanKind } from "@opentelemetry/api";

export const kubitIntegrationProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.KubitIntegrationJob) {
    logger.info("Executing Kubit Integration Job");
    try {
      return await handleKubitSchedule();
    } catch (error) {
      logger.error("Error executing KubitIntegrationJob", error);
      throw error;
    }
  }
};

export const kubitIntegrationProcessingProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.KubitIntegrationProcessingJob) {
    return await instrumentAsync(
      {
        name: "process kubit-integration-project",
        startNewTrace: true,
        spanKind: SpanKind.CONSUMER,
      },
      async () => {
        try {
          return await handleKubitProjectJob(job);
        } catch (error) {
          logger.error("Error executing KubitIntegrationProcessingJob", error);
          throw error;
        }
      },
    );
  }
};
