import chunk from "lodash/chunk";

import { prisma } from "../db";

const BATCH_SIZE = 10_000;

interface MediaFileRef {
  id: string;
  bucketPath: string;
}

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
    const datasetAssociatedMedia = await prisma.datasetItemMedia.findMany({
      select: { mediaId: true },
      where: {
        projectId,
        mediaId: { in: mediaIds },
      },
      distinct: ["mediaId"],
    });
    const datasetAssociatedMediaIds = new Set(
      datasetAssociatedMedia.map((media) => media.mediaId),
    );
    const deletableBatch = batch.filter(
      (f) => !datasetAssociatedMediaIds.has(f.id),
    );
    if (deletableBatch.length === 0) continue;

    const deletableMediaIds = deletableBatch.map((f) => f.id);

    await storageClient.deleteFiles(deletableBatch.map((f) => f.bucketPath));
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
