import { Prisma } from "@prisma/client";
import chunk from "lodash/chunk";

import { prisma } from "../db";

const BATCH_SIZE = 10_000;

interface MediaFileRef {
  id: string;
  bucketPath: string;
}

export interface MediaRetentionProject {
  projectId: string;
  retentionDays: number;
  cutoffDate: Date;
  secondsPastCutoff: number;
}

const expiredDeletableMediaCondition = (params: {
  projectId: Prisma.Sql;
  cutoffDate: Prisma.Sql;
}) => Prisma.sql`
  m.project_id = ${params.projectId}
  AND m.created_at <= ${params.cutoffDate}
  AND NOT EXISTS (
    SELECT 1
    FROM dataset_item_media dim
    WHERE dim.project_id = ${params.projectId}
      AND dim.media_id = m.id
      AND dim.dataset_item_valid_from IS NOT NULL
  )
`;

/**
 * Find all media files for a project (for complete project deletion).
 */
export async function findAllMediaByProjectId(params: {
  projectId: string;
  limit?: number;
}): Promise<MediaFileRef[]> {
  return prisma.media.findMany({
    select: { id: true, bucketPath: true },
    where: { projectId: params.projectId },
    ...(params.limit != null && { take: params.limit }),
  });
}

/**
 * Find expired media files for a project (for retention-based cleanup).
 * Dataset item associations are checked per batch in deleteMediaFiles.
 */
export async function findExpiredMediaByProjectId(params: {
  projectId: string;
  cutoffDate: Date;
}): Promise<MediaFileRef[]> {
  return prisma.media.findMany({
    select: { id: true, bucketPath: true },
    where: {
      projectId: params.projectId,
      createdAt: { lte: params.cutoffDate },
    },
  });
}

/**
 * Find the oldest bounded retention batch. Claimed dataset media is excluded
 * before applying the limit so every returned row can be deleted.
 */
export async function findExpiredMediaBatchByProjectId(params: {
  projectId: string;
  cutoffDate: Date;
  limit: number;
}): Promise<MediaFileRef[]> {
  const condition = expiredDeletableMediaCondition({
    projectId: Prisma.sql`${params.projectId}`,
    cutoffDate: Prisma.sql`${params.cutoffDate}`,
  });

  return prisma.$queryRaw<MediaFileRef[]>(Prisma.sql`
    SELECT m.id, m.bucket_path AS "bucketPath"
    FROM media m
    WHERE ${condition}
    ORDER BY m.created_at ASC, m.id ASC
    LIMIT ${params.limit}
  `);
}

/**
 * Find the project whose oldest deletable media is furthest past retention.
 * The lateral lookup stops at the first deletable row per project.
 */
export async function findNextMediaRetentionProject(): Promise<MediaRetentionProject | null> {
  const cutoffDate = Prisma.sql`
    NOW() - p.retention_days * INTERVAL '1 day'
  `;
  const condition = expiredDeletableMediaCondition({
    projectId: Prisma.sql`p.id`,
    cutoffDate,
  });
  const rows = await prisma.$queryRaw<MediaRetentionProject[]>(Prisma.sql`
    SELECT
      p.id AS "projectId",
      p.retention_days AS "retentionDays",
      ${cutoffDate} AS "cutoffDate",
      EXTRACT(EPOCH FROM (${cutoffDate} - oldest.created_at))::int
        AS "secondsPastCutoff"
    FROM projects p
    CROSS JOIN LATERAL (
      SELECT m.created_at
      FROM media m
      WHERE ${condition}
      ORDER BY m.created_at ASC
      LIMIT 1
    ) oldest
    WHERE p.retention_days > 0
      AND p.deleted_at IS NULL
    ORDER BY "secondsPastCutoff" DESC, p.id ASC
    LIMIT 1
  `);

  return rows[0] ?? null;
}

export interface StorageClient {
  deleteFiles: (paths: string[]) => Promise<void>;
}

/**
 * Delete media link rows for a project. Project deletion cannot rely on
 * project/media cascades for these rows because media link tables deliberately
 * do not have foreign keys to projects or media on the ingestion hot path.
 */
export async function deleteMediaLinkRowsByProjectId(params: {
  projectId: string;
}): Promise<void> {
  await prisma.$transaction([
    prisma.traceMedia.deleteMany({
      where: {
        projectId: params.projectId,
      },
    }),
    prisma.observationMedia.deleteMany({
      where: {
        projectId: params.projectId,
      },
    }),
    prisma.datasetItemMedia.deleteMany({
      where: {
        projectId: params.projectId,
      },
    }),
  ]);
}

/**
 * Delete media files from S3 first, then from PostgreSQL.
 * S3 is deleted first to avoid orphaned files if PG deletion succeeds but S3 fails.
 * Returns the number of media files deleted.
 */
export async function deleteMediaFiles(params: {
  projectId: string;
  mediaFiles: MediaFileRef[];
  storageClient: StorageClient;
}): Promise<number> {
  const { projectId, mediaFiles, storageClient } = params;

  if (mediaFiles.length === 0) {
    return 0;
  }

  // Process in batches to stay under PostgreSQL's 32,767 bind variable limit.
  // S3 is deleted before PG per batch to avoid orphaned storage files.
  // All callers target expired or soft-deleted media with retry semantics,
  // so partial failure self-heals on retry (S3 deletes are idempotent).
  const chunks = chunk(mediaFiles, BATCH_SIZE);
  let deletedCount = 0;

  for (const batch of chunks) {
    const mediaIds = batch.map((f) => f.id);
    // Only a claimed association (validFrom set) protects media; pending rows
    // (null validFrom) don't, so abandoned uploads are reclaimed by retention.
    const datasetAssociatedMedia = await prisma.datasetItemMedia.findMany({
      select: { mediaId: true },
      where: {
        projectId,
        mediaId: { in: mediaIds },
        datasetItemValidFrom: { not: null },
      },
      distinct: ["mediaId"],
    });
    const datasetAssociatedMediaIds = new Set(
      datasetAssociatedMedia.map((media) => media.mediaId),
    );
    const deletableBatch = batch.filter(
      (f) => !datasetAssociatedMediaIds.has(f.id),
    );
    const deletableMediaIds = deletableBatch.map((f) => f.id);

    if (deletableBatch.length > 0) {
      await storageClient.deleteFiles(deletableBatch.map((f) => f.bucketPath));
    }
    await prisma.$transaction([
      prisma.traceMedia.deleteMany({
        where: {
          projectId,
          mediaId: { in: deletableMediaIds },
        },
      }),
      prisma.observationMedia.deleteMany({
        where: {
          projectId,
          mediaId: { in: deletableMediaIds },
        },
      }),
      // Sweep leftover pending rows for the deleted media (claimed rows can't
      // exist for deletable media).
      prisma.datasetItemMedia.deleteMany({
        where: {
          projectId,
          mediaId: { in: deletableMediaIds },
          datasetItemValidFrom: null,
        },
      }),
      prisma.media.deleteMany({
        where: {
          id: { in: deletableMediaIds },
          projectId,
        },
      }),
    ]);

    deletedCount += deletableBatch.length;
  }

  return deletedCount;
}

/**
 * The link-row delete always runs: dataset_item_media has no FK to cascade on
 * dataset deletion, so this is the only path that drops these rows for a
 * dataset.
 */
export async function deleteDatasetMediaLinksByDatasetId(params: {
  projectId: string;
  datasetId: string;
}): Promise<void> {
  const { projectId, datasetId } = params;

  await prisma.datasetItemMedia.deleteMany({
    where: { projectId, datasetId },
  });
}

/**
 * Find projects that have been soft-deleted (deletedAt is set).
 */
export async function getDeletedProjects(
  limit: number,
): Promise<Array<{ id: string }>> {
  return prisma.project.findMany({
    select: { id: true },
    where: { deletedAt: { not: null } },
    take: limit,
  });
}

/**
 * Find the oldest soft-deleted project that still has media.
 * Uses EXISTS join supposed to be fast even with millions of media rows.
 */
export async function getDeletedProjectWithMedia(): Promise<string | null> {
  const result = await prisma.project.findFirst({
    select: { id: true },
    where: {
      deletedAt: { not: null },
      Media: { some: {} },
    },
    orderBy: { deletedAt: "asc" },
  });

  return result?.id ?? null;
}
