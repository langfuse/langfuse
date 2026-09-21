import { Processor } from "bullmq";
import {
  instrumentAsync,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { handleCloudFreeTierUsageThresholdJob } from "../ee/usageThresholds/handleCloudFreeTierUsageThresholdJob";
import { SpanKind } from "@opentelemetry/api";

export const cloudFreeTierUsageThresholdQueueProcessor: Processor = async (
  job,
) => {
  if (job.name === QueueJobs.CloudFreeTierUsageThresholdJob) {
    return await instrumentAsync(
      {
        name: "process cloud-free-tier-usage-threshold",
        startNewTrace: true,
        spanKind: SpanKind.CONSUMER,
      },
      async () => {
        logger.info(
          "[CloudFreeTierUsageThresholdJob] Executing Free Tier Usage Threshold Job",
          {
            jobId: job.id,
            jobName: job.name,
            jobData: job.data,
            timestamp: new Date().toISOString(),
            opts: {
              repeat: job.opts.repeat,
              jobId: job.opts.jobId,
            },
          },
        );
        try {
          return await handleCloudFreeTierUsageThresholdJob(job);
        } catch (error) {
          logger.error(
            "[CloudFreeTierUsageThresholdJob] Error executing Free Tier Usage Threshold Job",
            {
              jobId: job.id,
              error: error,
              timestamp: new Date().toISOString(),
            },
          );
          throw error;
        }
      },
    );
  }
};
