import { QueueName, recordHistogram } from "@langfuse/shared/src/server";
import { getQueue } from "@langfuse/shared/src/server";

export class DlxRetryService {
  private static queueRetryConfigs = {
    [QueueName.ProjectDelete]: {},
    [QueueName.TraceDelete]: {},
    [QueueName.ScoreDelete]: {},
  };

  public static async init() {}

  // called each 10 minutes, defined by the bull cron job
  public static async retryDeadLetterQueue() {
    for (const [queueName, config] of Object.entries(this.queueRetryConfigs)) {
      const queue = getQueue(queueName as QueueName);

      if (!queue) {
        console.error(`Queue ${queueName} not found`);
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
          console.log(
            `Retried job ${JSON.stringify(job)} in queue ${queueName}`,
          );
        } catch (error) {
          console.error(
            `Failed to retry job ${JSON.stringify(job)} in queue ${queueName}:`,
            error,
          );
        }
      }
    }
  }
}
