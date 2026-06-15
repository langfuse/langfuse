import chunk from "lodash/chunk";

import { prisma, Prisma } from "../db";

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
 * Media referenced by dataset items is excluded; it is only deleted with its
 * dataset or project.
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
      retainedByDatasetAt: null,
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
  for (const batch of chunks) {
    const mediaIds = batch.map((f) => f.id);

    await storageClient.deleteFiles(batch.map((f) => f.bucketPath));
    await prisma.$transaction([
      prisma.traceMedia.deleteMany({
        where: {
          projectId,
          mediaId: { in: mediaIds },
        },
      }),
      prisma.observationMedia.deleteMany({
        where: {
          projectId,
          mediaId: { in: mediaIds },
        },
      }),
      prisma.datasetItemMedia.deleteMany({
        where: {
          projectId,
          mediaId: { in: mediaIds },
        },
      }),
      prisma.media.deleteMany({
        where: {
          id: { in: mediaIds },
          projectId,
        },
      }),
    ]);
  }

  return mediaFiles.length;
}

/**
 * Release media that may have lost its last dataset reference. For each given
 * mediaId with no remaining dataset_item_media row: media still referenced by
 * a trace or observation is unmarked as dataset-retained (retention takes over
 * again), media with no references at all is deleted from S3 and Postgres.
 * Media still referenced by another dataset item is left untouched.
 *
 * Call after the relevant dataset_item_media rows have been deleted.
 */
export async function releaseDatasetMedia(params: {
  projectId: string;
  mediaIds: string[];
  storageClient: StorageClient;
}): Promise<void> {
  const { projectId, mediaIds, storageClient } = params;

  for (const batch of chunk(mediaIds, 1000)) {
    if (batch.length === 0) continue;

    // Media may still be referenced by items of other datasets (content
    // dedupe) — only release media with no remaining dataset references.
    const releasableMedia = await prisma.$queryRaw<
      { id: string; bucketPath: string; hasTraceReferences: boolean }[]
    >`
      SELECT
        m.id,
        m.bucket_path AS "bucketPath",
        (
          EXISTS (
            SELECT 1 FROM trace_media tm
            WHERE tm.project_id = m.project_id AND tm.media_id = m.id
          )
          OR EXISTS (
            SELECT 1 FROM observation_media om
            WHERE om.project_id = m.project_id AND om.media_id = m.id
          )
        ) AS "hasTraceReferences"
      FROM media m
      WHERE
        m.project_id = ${projectId}
        AND m.id IN (${Prisma.join(batch)})
        AND NOT EXISTS (
          SELECT 1 FROM dataset_item_media dim
          WHERE dim.project_id = m.project_id AND dim.media_id = m.id
        )
    `;
    if (releasableMedia.length === 0) continue;

    await prisma.media.updateMany({
      where: {
        projectId,
        id: {
          in: releasableMedia
            .filter((media) => media.hasTraceReferences)
            .map((media) => media.id),
        },
      },
      data: { retainedByDatasetAt: null },
    });

    await deleteMediaFiles({
      projectId,
      mediaFiles: releasableMedia.filter((media) => !media.hasTraceReferences),
      storageClient,
    });
  }
}

/**
 * Delete a dataset's media associations and release the referenced media (see
 * releaseDatasetMedia).
 */
export async function deleteDatasetMediaByDatasetId(params: {
  projectId: string;
  datasetId: string;
  storageClient: StorageClient;
}): Promise<void> {
  const { projectId, datasetId, storageClient } = params;

  const referencedMedia = await prisma.datasetItemMedia.findMany({
    select: { mediaId: true },
    where: { projectId, datasetId },
    distinct: ["mediaId"],
  });

  await prisma.datasetItemMedia.deleteMany({
    where: { projectId, datasetId },
  });

  await releaseDatasetMedia({
    projectId,
    mediaIds: referencedMedia.map((row) => row.mediaId),
    storageClient,
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
