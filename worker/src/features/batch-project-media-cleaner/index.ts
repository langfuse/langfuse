import { prisma } from "@langfuse/shared/src/db";
import {
  deleteMediaByProjectId,
  logger,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

export const BATCH_PROJECT_MEDIA_CLEANER_LOCK_KEY =
  "langfuse:batch-project-media-cleaner";

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
      mediaBatchSize: env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_MEDIA_BATCH_SIZE,
    });
    super.start();
  }

  public override async processBatch(): Promise<number> {
    return this.execute();
  }

  protected async execute(): Promise<number> {
    const deletedProjects = await prisma.project.findMany({
      select: { id: true },
      where: { deletedAt: { not: null } },
    });

    for (const project of deletedProjects) {
      const mediaCount = await prisma.media.count({
        where: { projectId: project.id },
      });

      if (mediaCount === 0) {
        continue;
      }

      return (
        (await this.withLock(async () => {
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
        })) ?? env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_SLEEP_ON_EMPTY_MS
      );
    }

    return env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_SLEEP_ON_EMPTY_MS;
  }
}
