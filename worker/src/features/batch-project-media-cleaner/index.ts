import { prisma } from "@langfuse/shared/src/db";
import {
  deleteMediaByProjectId,
  logger,
  recordIncrement,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

export const BATCH_PROJECT_MEDIA_CLEANER_LOCK_KEY =
  "langfuse:batch-project-media-cleaner";

const METRIC_PREFIX = "langfuse.batch_project_media_cleaner";

export class BatchProjectMediaCleaner extends PeriodicExclusiveRunner {
  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_SLEEP_ON_EMPTY_MS;
  }

  constructor() {
    const lockTtlSeconds =
      Math.ceil(env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_INTERVAL_MS / 1000) +
      300;

    super({
      name: "BatchProjectMediaCleaner",
      lockKey: BATCH_PROJECT_MEDIA_CLEANER_LOCK_KEY,
      lockTtlSeconds,
      onUnavailable: "fail",
    });
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      intervalMs: env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_INTERVAL_MS,
      sleepOnEmptyMs:
        env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_SLEEP_ON_EMPTY_MS,
      projectLimit: env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_PROJECT_LIMIT,
      mediaBatchSize: env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_MEDIA_BATCH_SIZE,
    });
    super.start();
  }

  public override async processBatch(): Promise<number> {
    return this.execute();
  }

  protected async execute(): Promise<number> {
    const projectsWithMedia = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT p.id
      FROM projects p
      INNER JOIN media m ON m.project_id = p.id
      WHERE p.deleted_at IS NOT NULL
      GROUP BY p.id
      ORDER BY count(*) DESC
      LIMIT ${env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_PROJECT_LIMIT}
    `;

    const project = projectsWithMedia.at(0);
    if (!project) {
      return env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_SLEEP_ON_EMPTY_MS;
    }

    return (
      (await this.withLock(
        async () => {
          try {
            await deleteMediaByProjectId({
              projectId: project.id,
              limit: env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_MEDIA_BATCH_SIZE,
            });
          } catch (error) {
            logger.error(`${this.instanceName}: Failed to delete media`, {
              projectId: project.id,
              error,
            });
            traceException(error);
          }

          try {
            if (env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG === "true") {
              await removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject(
                project.id,
                undefined,
              );
            }
          } catch (error) {
            logger.error(
              `${this.instanceName}: Failed to delete blob storage`,
              {
                projectId: project.id,
                error,
              },
            );
            traceException(error);
          }

          return env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_INTERVAL_MS;
        },
        () => {
          recordIncrement(`${METRIC_PREFIX}.deletion_failures`, 1);
        },
      )) ?? env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_SLEEP_ON_EMPTY_MS
    );
  }
}
