import chunk from "lodash/chunk";

import { Prisma, prisma } from "../db";

const BATCH_SIZE = 10_000;

type DeletedCountRow = { deletedCount: number };

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
  batchSize?: number;
}): Promise<void> {
  const batchSize = params.batchSize ?? BATCH_SIZE;
  if (batchSize <= 0) {
    throw new Error("batchSize must be greater than 0");
  }

  let traceMediaDeletedCount: number;
  do {
    traceMediaDeletedCount = await deleteTraceMediaLinkRowsBatchByProjectId({
      projectId: params.projectId,
      batchSize,
    });
  } while (traceMediaDeletedCount === batchSize);

  let observationMediaDeletedCount: number;
  do {
    observationMediaDeletedCount =
      await deleteObservationMediaLinkRowsBatchByProjectId({
        projectId: params.projectId,
        batchSize,
      });
  } while (observationMediaDeletedCount === batchSize);
}

async function deleteTraceMediaLinkRowsBatchByProjectId(params: {
  projectId: string;
  batchSize: number;
}): Promise<number> {
  const rows = await prisma.$queryRaw<DeletedCountRow[]>(Prisma.sql`
    WITH batch AS (
      SELECT id
      FROM trace_media
      WHERE project_id = ${params.projectId}
      LIMIT ${params.batchSize}
    ),
    deleted AS (
      DELETE FROM trace_media tm
      USING batch
      WHERE tm.id = batch.id
      RETURNING 1
    )
    SELECT COUNT(*)::int AS "deletedCount"
    FROM deleted
  `);

  return rows[0]?.deletedCount ?? 0;
}

async function deleteObservationMediaLinkRowsBatchByProjectId(params: {
  projectId: string;
  batchSize: number;
}): Promise<number> {
  const rows = await prisma.$queryRaw<DeletedCountRow[]>(Prisma.sql`
    WITH batch AS (
      SELECT id
      FROM observation_media
      WHERE project_id = ${params.projectId}
      LIMIT ${params.batchSize}
    ),
    deleted AS (
      DELETE FROM observation_media om
      USING batch
      WHERE om.id = batch.id
      RETURNING 1
    )
    SELECT COUNT(*)::int AS "deletedCount"
    FROM deleted
  `);

  return rows[0]?.deletedCount ?? 0;
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
