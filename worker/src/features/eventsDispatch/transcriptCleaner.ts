import {
  getS3EventStorageClient,
  logger,
  recordIncrement,
  TRACE_TRANSCRIPT_PREFIX,
  TRACE_TRANSCRIPT_RETENTION_MS,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

const METRIC_PREFIX = "langfuse.events_dispatch.transcript_cleaner";

/** Pause after a full pass of the prefix. */
const INTERVAL_MS = 60 * 60 * 1000;

/** Expired objects deleted per run. Checked between pages, so a run can exceed it by up to one list page. */
const MAX_DELETES_PER_RUN = 1_000;

/** Pages listed per run. A saved continuation token resumes the next run. */
const MAX_PAGES_PER_RUN = 50;

/**
 * Deletes stored events-dispatch transcripts older than the retention window.
 *
 * These objects are not blob-storage references, so project and trace deletion
 * do not remove them. One worker holds the lock, pages through the event-upload
 * prefix, and deletes a bounded batch with the shared event storage client.
 */
export class EventsDispatchTranscriptCleaner extends PeriodicExclusiveRunner {
  private continuationToken: string | undefined;

  protected get defaultIntervalMs(): number {
    return INTERVAL_MS;
  }

  constructor() {
    super({
      name: "EventsDispatchTranscriptCleaner",
      metricName: "events_dispatch_transcript_cleaner",
      lockKey: "langfuse:events-dispatch-transcript-cleaner",
      lockTtlSeconds: Math.ceil(INTERVAL_MS / 1000) + 300,
      onUnavailable: "fail",
    });
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      intervalMs: INTERVAL_MS,
      maxDeletesPerRun: MAX_DELETES_PER_RUN,
      retentionMs: TRACE_TRANSCRIPT_RETENTION_MS,
    });
    super.start();
  }

  protected async execute(): Promise<number> {
    const nextDelay = await this.withLock(
      async () => {
        const deleted = await this.deleteExpiredBatch();
        if (this.continuationToken) return 0;
        if (deleted === 0) {
          logger.info(`${this.instanceName}: No expired transcripts`);
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
    const prefix = `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${TRACE_TRANSCRIPT_PREFIX}`;
    const cutoff = Date.now() - TRACE_TRANSCRIPT_RETENTION_MS;
    let deleted = 0;

    for (
      let page = 0;
      page < MAX_PAGES_PER_RUN && deleted < MAX_DELETES_PER_RUN;
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
        logger.info(`${this.instanceName}: Deleted expired transcripts`, {
          count: expired.length,
          prefix,
        });
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
