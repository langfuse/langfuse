import { DelayedError, Processor } from "bullmq";
import {
  QueueJobs,
  logger,
  instrumentAsync,
} from "@langfuse/shared/src/server";
import { handleBlobStorageIntegrationSchedule } from "../features/blobstorage/handleBlobStorageIntegrationSchedule";
import { handleBlobStorageIntegrationProjectJob } from "../features/blobstorage/handleBlobStorageIntegrationProjectJob";
import { getBlobExportShutdownSignal } from "../features/blobstorage/inFlightExports";
import { SpanKind } from "@opentelemetry/api";

export const blobStorageIntegrationProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.BlobStorageIntegrationJob) {
    logger.info("Executing Blob Storage Integration Job");
    try {
      return await handleBlobStorageIntegrationSchedule();
    } catch (error) {
      logger.error("Error executing BlobStorageIntegrationJob", error);
      throw error;
    }
  }
};

export const blobStorageIntegrationProcessingProcessor: Processor = async (
  job,
) => {
  if (job.name === QueueJobs.BlobStorageIntegrationProcessingJob) {
    return await instrumentAsync(
      {
        name: "process blob-storage-project",
        startNewTrace: true,
        spanKind: SpanKind.CONSUMER,
      },
      async () => {
        try {
          return await handleBlobStorageIntegrationProjectJob(job);
        } catch (error) {
          // Hand the job back to the queue instead of letting ECS kill it
          // mid-export: a re-queue costs neither an attempt nor a stall.
          if (getBlobExportShutdownSignal().aborted) {
            logger.info(
              `[BLOB INTEGRATION] Re-queued blob storage export job ${job.id} on worker shutdown`,
            );
            // job.token: WorkerManager.metricWrapper does not forward the
            // processor's token argument.
            await job.moveToDelayed(Date.now(), job.token);
            throw new DelayedError();
          }
          logger.error(
            "Error executing BlobStorageIntegrationProcessingJob",
            error,
          );
          throw error;
        }
      },
    );
  }
};
