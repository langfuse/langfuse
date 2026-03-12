import {
  deleteMediaFiles,
  findAllMediaByProjectId,
  getDeletedProjectWithMedia,
  getS3MediaStorageClient,
  logger,
  recordGauge,
  recordIncrement,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

const METRIC_PREFIX = "langfuse.batch_project_media_cleaner";

/**
 * BatchProjectMediaCleaner is a safety net for S3 media cleanup of soft-deleted projects.
 *
 * The ProjectDelete queue job handles full cleanup, but projects with millions of
 * media items often have their monolithic job killed mid-flight (deploys, OOM, timeouts).
 * This cleaner picks the oldest-deleted project that still has media and deletes
 * BATCH_SIZE items per iteration, chipping away so that when the queue job is
 * retried it has less work to do and a better chance of completing.
 */
export class BatchProjectMediaCleaner extends PeriodicExclusiveRunner {
  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
  }

  constructor() {
    const lockTtlSeconds =
      Math.ceil(env.LANGFUSE_BATCH_PROJECT_CLEANER_DELETE_TIMEOUT_MS / 1000) +
      300;

    super({
      name: "BatchProjectMediaCleaner",
      lockKey: "langfuse:batch-project-media-cleaner",
      lockTtlSeconds,
    });
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      sleepOnEmptyMs: env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS,
      checkIntervalMs: env.LANGFUSE_BATCH_PROJECT_CLEANER_CHECK_INTERVAL_MS,
      batchSize: env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_BATCH_SIZE,
    });
    super.start();
  }

  protected async execute(): Promise<number> {
    // Project selection + deletion both run under lock to prevent two workers
    // picking the same project. Media S3 deletion is idempotent but wasteful
    // if duplicated.
    return (
      (await this.withLock(
        async () => {
          let targetProjectId: string | null;
          try {
            targetProjectId = await getDeletedProjectWithMedia();
          } catch (error) {
            logger.error(
              `${this.instanceName}: Failed to query target project`,
              { error },
            );
            traceException(error);
            return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
          }

          if (!targetProjectId) {
            logger.info(`${this.instanceName}: No deleted projects with media`);
            return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
          }

          logger.info(`${this.instanceName}: Processing project`, {
            projectId: targetProjectId,
          });

          return this.deleteMediaChunk(targetProjectId);
        },
        (_error) => {
          recordIncrement(`${METRIC_PREFIX}.failures`, 1);
          return env.LANGFUSE_BATCH_PROJECT_CLEANER_CHECK_INTERVAL_MS;
        },
      )) ?? env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS
    );
  }

  private async deleteMediaChunk(projectId: string): Promise<number> {
    const batchSize = env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_BATCH_SIZE;

    const mediaFiles = await findAllMediaByProjectId({
      projectId,
      limit: batchSize,
    });

    recordGauge(`${METRIC_PREFIX}.batch_items`, mediaFiles.length, {
      projectId,
    });

    if (mediaFiles.length === 0) {
      logger.info(`${this.instanceName}: No media remaining`, { projectId });
      return env.LANGFUSE_BATCH_PROJECT_CLEANER_CHECK_INTERVAL_MS;
    }

    await deleteMediaFiles({
      projectId,
      mediaFiles,
      storageClient: getS3MediaStorageClient(
        env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET!,
      ),
    });

    recordIncrement(`${METRIC_PREFIX}.media_files_deleted`, mediaFiles.length, {
      projectId,
    });

    logger.info(`${this.instanceName}: Deleted media chunk`, {
      projectId,
      count: mediaFiles.length,
      hasMore: mediaFiles.length >= batchSize,
    });

    return env.LANGFUSE_BATCH_PROJECT_CLEANER_CHECK_INTERVAL_MS;
  }
}
