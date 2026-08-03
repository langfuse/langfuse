import {
  ClickhouseWriterDeadLetterEventSchema,
  getS3EventStorageClient,
  logger,
  QueueName,
  recordHistogram,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { getQueue } from "@langfuse/shared/src/server";
import type { Job } from "bullmq";
import { z } from "zod";
import { env } from "../../env";
import { ClickhouseWriter, TableName } from "../ClickhouseWriter";

const ClickhouseWriterDeadLetterRecordsSchema = z.array(
  z.record(z.string(), z.unknown()),
);

export class DlqRetryService {
  private static retryQueues = [
    QueueName.ProjectDelete,
    QueueName.TraceDelete,
    QueueName.ScoreDelete,
    QueueName.BatchActionQueue,
    QueueName.DataRetentionProcessingQueue,
  ] as const;

  public static async replayClickhouseWriterRecords(job: Job): Promise<void> {
    const payload = ClickhouseWriterDeadLetterEventSchema.parse(
      job.data.payload,
    );
    const storage = getS3EventStorageClient(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
    );
    const records = ClickhouseWriterDeadLetterRecordsSchema.parse(
      JSON.parse(await storage.download(payload.fileKey)),
    );

    await ClickhouseWriter.getInstance().replayDeadLetterRecords(
      payload.tableName as TableName,
      records,
    );

    recordIncrement(
      "langfuse.queue.clickhouse_writer.rows_replayed",
      records.length,
      {
        entity_type: payload.tableName,
      },
    );

    try {
      await storage.deleteFiles([payload.fileKey]);
    } catch (error) {
      logger.warn(
        `ClickhouseWriter DLQ replay succeeded but failed to delete ${payload.fileKey}`,
        error,
      );
    }
  }

  // called each 10 minutes, defined by the bull cron job
  public static async retryDeadLetterQueue() {
    logger.info(
      `Retrying dead letter queues for queues: ${DlqRetryService.retryQueues.join(
        ", ",
      )}`,
    );
    const retryQueues = DlqRetryService.retryQueues;
    for (const queueName of retryQueues) {
      const queue = getQueue(queueName);

      if (!queue) {
        logger.error(`Queue ${queueName} not found`);
        continue;
      }

      // Find failed jobs
      const failedJobs = await queue.getFailed();
      logger.info(
        `Found ${failedJobs.length} failed jobs in queue ${queueName}`,
      );
      for (const job of failedJobs) {
        try {
          const projectId = job.data.payload.projectId;
          const ts = job.data.timestamp;

          const dlxDelay = Date.now() - ts;

          recordHistogram("langfuse.dlq_retry_delay", dlxDelay, {
            unit: "milliseconds",
            projectId,
            queueName,
          });

          await job.retry();
          logger.info(
            `Retried job ${JSON.stringify(job)} in queue ${queueName}`,
          );
        } catch (error) {
          logger.error(
            `Failed to retry job ${JSON.stringify(job)} in queue ${queueName}:`,
            error,
          );
        }
      }
    }
  }
}
