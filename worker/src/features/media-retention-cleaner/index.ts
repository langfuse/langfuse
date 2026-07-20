import {
  deleteMediaFiles,
  findExpiredMediaBatchByProjectId,
  findNextMediaRetentionProject,
  getS3MediaStorageClient,
  logger,
  type MediaRetentionProject,
  recordGauge,
  recordIncrement,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

const METRIC_PREFIX = "langfuse.media_retention_cleaner";

export const MEDIA_RETENTION_CLEANER_LOCK_KEY =
  "langfuse:media-retention-cleaner";

/**
 * MediaRetentionCleaner handles periodic deletion of media files and blob storage
 * entries based on project retention settings.
 *
 * Processes one project per iteration (oldest actionable media first).
 * Run frequently to process all projects over time.
 */
export class MediaRetentionCleaner extends PeriodicExclusiveRunner {
  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_MEDIA_RETENTION_CLEANER_INTERVAL_MS;
  }

  constructor() {
    // TTL = interval + 5 minutes buffer (media deletion can be slow)
    const lockTtlSeconds =
      Math.ceil(env.LANGFUSE_MEDIA_RETENTION_CLEANER_INTERVAL_MS / 1000) + 300;

    super({
      name: "MediaRetentionCleaner",
      lockKey: MEDIA_RETENTION_CLEANER_LOCK_KEY,
      lockTtlSeconds,
      onUnavailable: "fail",
    });
  }

  /**
   * Start the media retention cleaner service
   */
  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      intervalMs: env.LANGFUSE_MEDIA_RETENTION_CLEANER_INTERVAL_MS,
      itemLimit: env.LANGFUSE_MEDIA_RETENTION_CLEANER_ITEM_LIMIT,
    });
    super.start();
  }

  /**
   * Process expired media for the project furthest past its cutoff.
   * Preflight and deletion are both under lock to avoid redundant expensive queries.
   */
  protected async execute(): Promise<void> {
    // Reset gauge before attempting lock - ensures it doesn't appear stuck
    // if another worker holds the lock
    recordGauge(`${METRIC_PREFIX}.seconds_past_cutoff`, 0);

    await this.withLock(
      async () => {
        // Get the most overdue project (single project per iteration)
        let workload: MediaRetentionProject | null;
        try {
          workload = await findNextMediaRetentionProject();
        } catch (error) {
          logger.error(`${this.name}: Failed to query project workload`, {
            error,
          });
          traceException(error);
          recordIncrement(`${METRIC_PREFIX}.query_failures`, 1);
          throw error;
        }

        // Record gauge for how far past cutoff the oldest expired item is
        recordGauge(
          `${METRIC_PREFIX}.seconds_past_cutoff`,
          Math.max(workload?.secondsPastCutoff ?? 0, 0),
        );
        if (workload) {
          logger.info(`${this.instanceName}: Processing project`, {
            projectId: workload.projectId,
            retentionDays: workload.retentionDays,
            secondsPastCutoff: workload.secondsPastCutoff,
          });

          await this.processProject(workload);
          recordIncrement(`${METRIC_PREFIX}.projects_processed`, 1);
        } else {
          logger.info(`${this.name}: No expired media to clean up`);
        }
      },
      () => {
        recordIncrement(`${METRIC_PREFIX}.project_failures`, 1);
      },
    );
  }

  private async processProject(workload: MediaRetentionProject): Promise<void> {
    // Delete media files (S3 + PostgreSQL)
    if (env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
      await this.deleteExpiredMedia(workload);
    }

    // Delete blob storage entries (S3 + ClickHouse soft delete)
    if (env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG === "true") {
      await removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject(
        workload.projectId,
        workload.cutoffDate,
      );
    }

    logger.info(`${this.name}: Project processed`, {
      projectId: workload.projectId,
      retentionDays: workload.retentionDays,
    });
  }

  private async deleteExpiredMedia(
    workload: MediaRetentionProject,
  ): Promise<void> {
    const mediaFiles = await findExpiredMediaBatchByProjectId({
      projectId: workload.projectId,
      cutoffDate: workload.cutoffDate,
      limit: env.LANGFUSE_MEDIA_RETENTION_CLEANER_ITEM_LIMIT,
    });

    // Record gauge for observed work
    recordGauge(`${METRIC_PREFIX}.pending_items`, mediaFiles.length, {
      projectId: workload.projectId,
    });

    if (mediaFiles.length === 0) {
      return;
    }

    const deletedCount = await deleteMediaFiles({
      projectId: workload.projectId,
      mediaFiles,
      storageClient: getS3MediaStorageClient(
        env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET!,
      ),
    });

    // Record successful deletion metrics
    recordIncrement(`${METRIC_PREFIX}.files_deleted`, deletedCount, {
      projectId: workload.projectId,
    });

    logger.info(`${this.name}: Media files deleted`, {
      projectId: workload.projectId,
      count: deletedCount,
    });
  }
}
