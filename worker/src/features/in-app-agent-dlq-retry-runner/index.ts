import type { Job } from "bullmq";
import { IN_APP_AGENT_HEARTBEAT_STALE_MS } from "@langfuse/shared/in-app-agent/server/tunables";
import { getQueue, logger, QueueName } from "@langfuse/shared/src/server";

import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

const IN_APP_AGENT_DLQ_RETRY_LOCK_KEY = "langfuse:in-app-agent-dlq-retry";

const LOCK_TTL_SECONDS = 120;

/**
 * Pokes failed in-app-agent BullMQ jobs so stall corpses can claim-miss,
 * reconcile, and ACK. BullMQ is delivery-only on this queue (`attempts: 1`);
 * this runner is the explicit retry, not the shared dead-letter cron.
 *
 * Skips jobs that failed within the heartbeat-stale window: claim-miss ACKs
 * even when reconcile writes nothing, so a too-fresh persist failure would
 * leave Postgres RUNNING with no Redis job left to poke.
 */
export class InAppAgentDlqRetryRunner extends PeriodicExclusiveRunner {
  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_IN_APP_AGENT_DLQ_RETRY_INTERVAL_MS;
  }

  constructor() {
    super({
      name: "InAppAgentDlqRetryRunner",
      metricName: "in_app_agent_dlq_retry",
      lockKey: IN_APP_AGENT_DLQ_RETRY_LOCK_KEY,
      lockTtlSeconds: LOCK_TTL_SECONDS,
      onUnavailable: "fail",
    });
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      intervalMs: env.LANGFUSE_IN_APP_AGENT_DLQ_RETRY_INTERVAL_MS,
    });
    super.start();
  }

  protected async execute(): Promise<void> {
    await this.withLock(async () => {
      const queue = getQueue(QueueName.InAppAgentRunQueue);
      if (!queue) {
        logger.error(`${this.instanceName}: Queue not found`);
        return;
      }

      const failedJobs = await queue.getFailed();
      const nowMs = Date.now();
      let retried = 0;
      let skipped = 0;

      for (const job of failedJobs) {
        if (!isFailedInAppAgentJobReadyToRetry(job, nowMs)) {
          skipped += 1;
          continue;
        }

        try {
          await job.retry();
          retried += 1;
        } catch (error) {
          logger.error(
            `${this.instanceName}: Failed to retry job ${job.id} in ${QueueName.InAppAgentRunQueue}`,
            error,
          );
        }
      }

      logger.info(`${this.instanceName}: processed failed jobs`, {
        failed: failedJobs.length,
        retried,
        skipped,
      });
    });
  }
}

function isFailedInAppAgentJobReadyToRetry(
  job: Pick<Job, "finishedOn">,
  nowMs: number,
): boolean {
  if (job.finishedOn == null) {
    return true;
  }

  return nowMs - job.finishedOn >= IN_APP_AGENT_HEARTBEAT_STALE_MS;
}
