import {
  getS3EventStorageClient,
  logger,
  recordIncrement,
  TRACE_BATCH_INPUT_PREFIX,
  TRACE_BATCH_INPUT_RETENTION_MS,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

const METRIC_PREFIX = "langfuse.trace_batch_input_cleaner";

/** Pages listed per run. A saved continuation token resumes the next run. */
const MAX_PAGES_PER_RUN = 50;

/**
 * Deletes trace-batch input objects older than the retention window.
 *
 * These objects are not blob-storage references, so project and trace deletion
 * do not remove them. One worker holds the lock, pages through the event-upload
 * prefix, and deletes a bounded batch with the shared event storage client.
 */
export class TraceBatchInputCleaner extends PeriodicExclusiveRunner {
  private continuationToken: string | undefined;

  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_TRACE_BATCH_INPUT_CLEANER_INTERVAL_MS;
  }

  constructor() {
    const lockTtlSeconds =
      Math.ceil(env.LANGFUSE_TRACE_BATCH_INPUT_CLEANER_INTERVAL_MS / 1000) +
      300;

    super({
      name: "TraceBatchInputCleaner",
      metricName: "trace_batch_input_cleaner",
      lockKey: "langfuse:trace-batch-input-cleaner",
      lockTtlSeconds,
      onUnavailable: "fail",
    });
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      intervalMs: env.LANGFUSE_TRACE_BATCH_INPUT_CLEANER_INTERVAL_MS,
      batchSize: env.LANGFUSE_TRACE_BATCH_INPUT_CLEANER_BATCH_SIZE,
      retentionMs: TRACE_BATCH_INPUT_RETENTION_MS,
    });
    super.start();
  }

  protected async execute(): Promise<number> {
    const nextDelay = await this.withLock(
      async () => {
        const deleted = await this.deleteExpiredBatch();
        if (this.continuationToken) return 0;
        if (deleted === 0) {
          logger.info(`${this.instanceName}: No expired trace-batch inputs`);
        }
        return this.defaultIntervalMs;
      },
      () => {
        recordIncrement(`${METRIC_PREFIX}.failures`, 1);
        return this.defaultIntervalMs;
      },
    );

    return nextDelay ?? this.defaultIntervalMs;
  }

  private async deleteExpiredBatch(): Promise<number> {
    const storage = getS3EventStorageClient(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
    );
    const prefix = `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${TRACE_BATCH_INPUT_PREFIX}`;
    const cutoff = Date.now() - TRACE_BATCH_INPUT_RETENTION_MS;
    const batchSize = env.LANGFUSE_TRACE_BATCH_INPUT_CLEANER_BATCH_SIZE;
    let deleted = 0;

    for (
      let page = 0;
      page < MAX_PAGES_PER_RUN && deleted < batchSize;
      page++
    ) {
      await this.extendLockOnProgress();
      const requestedToken = this.continuationToken;
      const listed = await storage.listFilePage({
        prefix,
        continuationToken: requestedToken,
      });
      const expired = listed.files
        .filter((file) => file.createdAt.getTime() <= cutoff)
        .map((file) => file.file);

      if (expired.length > 0) {
        await storage.deleteFiles(expired);
        deleted += expired.length;
        recordIncrement(`${METRIC_PREFIX}.files_deleted`, expired.length);
        logger.info(
          `${this.instanceName}: Deleted expired trace-batch inputs`,
          {
            count: expired.length,
            prefix,
          },
        );
      }

      const nextToken = listed.continuationToken;
      if (!nextToken || nextToken === requestedToken) {
        this.continuationToken = undefined;
        break;
      }
      this.continuationToken = nextToken;
    }

    return deleted;
  }
}
