import {
  logger,
  QueueName,
  recordHistogram,
} from "@langfuse/shared/src/server";
import { getQueue } from "@langfuse/shared/src/server";

export class DlxRetryService {
  private static retryQueues = [
    QueueName.ProjectDelete,
    QueueName.TraceDelete,
    QueueName.ScoreDelete,
  ];

  // called each 10 minutes, defined by the bull cron job
  public static async retryDeadLetterQueue() {
    logger.info("Retrying dead letter queue");
    const retryQueues = DlxRetryService.retryQueues;
    for (const queueName of retryQueues) {
      const queue = getQueue(queueName as QueueName);

      if (!queue) {
        logger.error(`Queue ${queueName} not found`);
        continue;
      }

      // Find failed jobs
      const failedJobs = await queue.getFailed();
      for (const job of failedJobs) {
        try {
          const projectId = job.data.payload.projectId;
          const ts = job.data.timestamp;
          const name = job.data.name;

          const dlxDelay = Date.now() - ts;

          recordHistogram("dlx_retry_delay", dlxDelay, {
            unit: "milliseconds",
            projectId,
            name,
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
