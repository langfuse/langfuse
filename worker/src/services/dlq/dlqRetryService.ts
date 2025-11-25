import {
  logger,
  QueueName,
  recordHistogram,
} from "@langfuse/shared/src/server";
import { getQueue } from "@langfuse/shared/src/server";

export class DlqRetryService {
  private static retryQueues = [
    QueueName.ProjectDelete,
    QueueName.TraceDelete,
    QueueName.ScoreDelete,
    QueueName.BatchActionQueue,
    QueueName.DataRetentionProcessingQueue,
  ] as const;

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
