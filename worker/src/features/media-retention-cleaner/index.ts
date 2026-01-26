import { prisma } from "@langfuse/shared/src/db";
import {
  getS3MediaStorageClient,
  logger,
  recordGauge,
  recordIncrement,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { getRetentionCutoffDate } from "../utils";

const METRIC_PREFIX = "langfuse.media_retention_cleaner";

interface ProjectWorkload {
  projectId: string;
  retentionDays: number;
  cutoffDate: Date;
  expiredMediaCount: number;
  secondsPastCutoff: number | null;
}

/**
 * MediaRetentionCleaner handles periodic deletion of media files and blob storage
 * entries based on project retention settings.
 *
 * Processes one project per iteration (most work first) for simplicity.
 * Run frequently to process all projects over time.
 */
export class MediaRetentionCleaner {
  public static async processBatch(): Promise<void> {
    const instanceName = "MediaRetentionCleaner";

    // Get the project with most expired media (single project per iteration)
    let workload: ProjectWorkload | null;
    try {
      workload = await MediaRetentionCleaner.getTopProjectWorkload();
    } catch (error) {
      logger.error(`${instanceName}: Failed to query project workload`, {
        error,
      });
      traceException(error);
      recordIncrement(`${METRIC_PREFIX}.query_failures`, 1);
      return;
    }

    if (!workload) {
      logger.info(`${instanceName}: No expired media to clean up`);
      return;
    }

    // Record gauge for observed work
    recordGauge(`${METRIC_PREFIX}.pending_items`, workload.expiredMediaCount, {
      projectId: workload.projectId,
    });

    // Record gauge for how far past cutoff the oldest expired item is
    if (workload.secondsPastCutoff !== null) {
      recordGauge(
        `${METRIC_PREFIX}.seconds_past_cutoff`,
        Math.max(workload.secondsPastCutoff, 0),
      );
    }

    logger.info(`${instanceName}: Processing project`, {
      projectId: workload.projectId,
      retentionDays: workload.retentionDays,
      expiredMediaCount: workload.expiredMediaCount,
      secondsPastCutoff: workload.secondsPastCutoff,
    });

    try {
      await MediaRetentionCleaner.processProject(workload);
      recordIncrement(`${METRIC_PREFIX}.projects_processed`, 1);
    } catch (error) {
      logger.error(`${instanceName}: Failed to process project`, {
        projectId: workload.projectId,
        retentionDays: workload.retentionDays,
        error,
      });
      traceException(error);
      recordIncrement(`${METRIC_PREFIX}.project_failures`, 1);
      throw error;
    }
  }

  /**
   * Get the project with the most expired media (single query via Prisma).
   * Returns null if no projects have expired media.
   */
  private static async getTopProjectWorkload(): Promise<ProjectWorkload | null> {
    const now = new Date();

    // Single query: join projects with media, filter by retention cutoff, order by count, limit 1
    // Using raw SQL for the complex per-project cutoff logic
    const result = await prisma.$queryRaw<
      Array<{
        project_id: string;
        retention_days: number;
        expired_count: bigint;
        seconds_past_cutoff: number;
      }>
    >`
      SELECT
        p.id as project_id,
        p.retention_days,
        COUNT(m.id) as expired_count,
        EXTRACT(EPOCH FROM (
          (NOW() - (p.retention_days || ' days')::interval) - MIN(m.created_at)
        ))::int as seconds_past_cutoff
      FROM projects p
      INNER JOIN media m ON m.project_id = p.id
      WHERE p.retention_days > 0
        AND p.deleted_at IS NULL
        AND m.created_at <= NOW() - (p.retention_days || ' days')::interval
      GROUP BY p.id, p.retention_days
      ORDER BY expired_count DESC
      LIMIT 1
    `;

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      projectId: row.project_id,
      retentionDays: row.retention_days,
      cutoffDate: getRetentionCutoffDate(row.retention_days, now),
      expiredMediaCount: Number(row.expired_count),
      secondsPastCutoff: row.seconds_past_cutoff,
    };
  }

  private static async processProject(
    workload: ProjectWorkload,
  ): Promise<void> {
    // Delete media files (S3 + PostgreSQL)
    if (env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
      await MediaRetentionCleaner.deleteExpiredMedia(
        workload,
        env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
      );
    }

    // Delete blob storage entries (S3 + ClickHouse soft delete)
    if (env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG === "true") {
      await removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject(
        workload.projectId,
        workload.cutoffDate,
      );
    }

    logger.info("MediaRetentionCleaner: Project processed", {
      projectId: workload.projectId,
      retentionDays: workload.retentionDays,
      expiredMediaCount: workload.expiredMediaCount,
    });
  }

  private static async deleteExpiredMedia(
    workload: ProjectWorkload,
    bucket: string,
  ): Promise<void> {
    const mediaFiles = await prisma.media.findMany({
      select: { id: true, bucketPath: true },
      where: {
        projectId: workload.projectId,
        createdAt: { lte: workload.cutoffDate },
      },
    });

    if (mediaFiles.length === 0) {
      return;
    }

    // Delete from S3 first
    const mediaStorageClient = getS3MediaStorageClient(bucket);
    await mediaStorageClient.deleteFiles(mediaFiles.map((f) => f.bucketPath));

    // Delete from PostgreSQL (cascades to traceMedia/observationMedia)
    await prisma.media.deleteMany({
      where: {
        id: { in: mediaFiles.map((f) => f.id) },
        projectId: workload.projectId,
      },
    });

    // Record successful deletion metrics
    recordIncrement(`${METRIC_PREFIX}.files_deleted`, mediaFiles.length, {
      projectId: workload.projectId,
    });

    logger.info("MediaRetentionCleaner: Media files deleted", {
      projectId: workload.projectId,
      count: mediaFiles.length,
    });
  }
}
