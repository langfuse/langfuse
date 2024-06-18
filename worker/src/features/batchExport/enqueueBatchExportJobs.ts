import { BatchExportStatus, QueueJobs } from "@langfuse/shared";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import * as Sentry from "@sentry/node";

import logger from "../../logger";
import { batchExportQueue } from "../../queues/batchExportQueue";

/**
 * Enqueues batch export jobs from the database to the job queue.
 *
 * @returns A promise that resolves when the jobs are enqueued successfully.
 */
export async function enqueueBatchExportJobs() {
  try {
    const queuedJobs = await kyselyPrisma.$kysely
      .selectFrom("batch_exports")
      .selectAll()
      .where("status", "=", BatchExportStatus.QUEUED)
      .execute();

    if (batchExportQueue) {
      const newJobs = queuedJobs.map(
        (job) =>
          ({
            name: QueueJobs.BatchExportJob,
            data: {
              id: job.id, // Important to deduplicate when the same job is already in the queue
              name: QueueJobs.BatchExportJob,
              timestamp: new Date(),
              payload: {
                batchExportId: job.id,
                projectId: job.project_id,
              },
            },
          }) as const
      );

      await batchExportQueue.addBulk(newJobs);
      logger.info(`Enqueued ${newJobs.length} batch export jobs from postgres`);
    }
  } catch (error) {
    logger.error(
      "Error while checking for QUEUED batch export jobs in postgres",
      error
    );
    Sentry.captureException(error);
  }
}
