import { BatchExportStatus } from "@langfuse/shared";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import logger from "../../logger";
import {
  traceException,
  getBatchExportQueue,
  QueueJobs,
} from "@langfuse/shared/src/server";

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

    const queue = getBatchExportQueue();
    if (queue) {
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

      await queue.addBulk(newJobs);
      logger.info(`Enqueued ${newJobs.length} batch export jobs from postgres`);
    }
  } catch (error) {
    logger.error(
      "Error while checking for QUEUED batch export jobs in postgres",
      error
    );
    traceException(error);
  }
}
