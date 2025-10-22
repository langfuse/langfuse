import { Processor } from "bullmq";
import {
  instrumentAsync,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { handleDataRetentionSchedule } from "../ee/dataRetention/handleDataRetentionSchedule";
import { handleDataRetentionProcessingJob } from "../ee/dataRetention/handleDataRetentionProcessingJob";
import { SpanKind } from "@opentelemetry/api";

export const dataRetentionProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.DataRetentionJob) {
    logger.info("Executing Data Retention Job");
    try {
      return await handleDataRetentionSchedule();
    } catch (error) {
      logger.error("Error executing DataRetentionJob", error);
      throw error;
    }
  }
};

export const dataRetentionProcessingProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.DataRetentionProcessingJob) {
    return await instrumentAsync(
      {
        name: "process data-retention-project",
        startNewTrace: true,
        spanKind: SpanKind.CONSUMER,
      },
      async () => {
        try {
          return await handleDataRetentionProcessingJob(job);
        } catch (error) {
          logger.error("Error executing DataRetentionProcessingJob", error);
          throw error;
        }
      },
    );
  }
};
