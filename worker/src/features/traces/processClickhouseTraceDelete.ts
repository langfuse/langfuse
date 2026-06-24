import {
  deleteEventsByTraceIds,
  deleteObservationsByTraceIds,
  deleteScoresByTraceIds,
  deleteTraces,
  getS3MediaStorageClient,
  logger,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForTraces,
  traceException,
} from "@langfuse/shared/src/server";
import { env, v4WritesToEventsTable } from "../../env";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { chunk } from "lodash";

const deleteMediaItemsForTraces = async (
  projectId: string,
  traceIds: string[],
): Promise<void> => {
  if (!env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
    return;
  }

  // Phase 1: Find and delete references, collect affected mediaIds
  const allMediaIds = new Set<string>();
  const [traceMediaItems, observationMediaItems] = await Promise.all([
    prisma.traceMedia.findMany({
      select: {
        mediaId: true,
      },
      where: {
        projectId,
        traceId: {
          in: traceIds,
        },
      },
    }),
    prisma.observationMedia.findMany({
      select: {
        mediaId: true,
      },
      where: {
        projectId,
        traceId: {
          in: traceIds,
        },
      },
    }),
  ]);

  // Collect all affected mediaIds
  traceMediaItems.forEach((item) => allMediaIds.add(item.mediaId));
  observationMediaItems.forEach((item) => allMediaIds.add(item.mediaId));

  // Phase 2: Delete orphaned media items using NOT EXISTS subquery
  if (allMediaIds.size === 0) {
    return;
  }

  const mediaIdChunks = chunk(Array.from(allMediaIds), 1000);
  const s3DeletedMediaIds: string[] = [];

  for (const mediaIdChunk of mediaIdChunks) {
    // Delete S3 before Postgres so a storage failure leaves trace links for
    // retry discovery. Re-check orphan guards after deleting the trace links.
    const orphanedMedia = await prisma.$queryRaw<
      { id: string; bucketPath: string }[]
    >`
      SELECT m.id, m.bucket_path AS "bucketPath"
      FROM media m
      WHERE
        m.project_id = ${projectId}
        AND m.id IN (${Prisma.join(mediaIdChunk)})
        AND NOT EXISTS (
          SELECT 1
          FROM trace_media tm
          WHERE tm.project_id = m.project_id
            AND tm.media_id = m.id
            AND tm.trace_id NOT IN (${Prisma.join(traceIds)})
        )
        AND NOT EXISTS (
          SELECT 1
          FROM observation_media om
          WHERE om.project_id = m.project_id
            AND om.media_id = m.id
            AND om.trace_id NOT IN (${Prisma.join(traceIds)})
        )
        -- Only a claimed association (validFrom set) protects media; pending
        -- rows (null validFrom) are sweepable, matching deleteMediaFiles.
        AND NOT EXISTS (
          SELECT 1
          FROM dataset_item_media dim
          WHERE dim.project_id = m.project_id
            AND dim.media_id = m.id
            AND dim.dataset_item_valid_from IS NOT NULL
        )
    `;

    if (orphanedMedia.length > 0) {
      await getS3MediaStorageClient(
        env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET ?? "", // Fallback is never used.
      ).deleteFiles(orphanedMedia.map((f) => f.bucketPath));

      s3DeletedMediaIds.push(...orphanedMedia.map((m) => m.id));
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.traceMedia.deleteMany({
      where: {
        projectId,
        traceId: {
          in: traceIds,
        },
      },
    });

    await tx.observationMedia.deleteMany({
      where: {
        projectId,
        traceId: {
          in: traceIds,
        },
      },
    });

    if (s3DeletedMediaIds.length > 0) {
      // Sweep leftover pending rows for the deleted media (claimed rows can't
      // exist for deletable media), matching deleteMediaFiles.
      await tx.datasetItemMedia.deleteMany({
        where: {
          projectId,
          mediaId: { in: s3DeletedMediaIds },
          datasetItemValidFrom: null,
        },
      });

      await tx.$executeRaw`
        DELETE FROM media m
        WHERE
          m.project_id = ${projectId}
          AND m.id IN (${Prisma.join(s3DeletedMediaIds)})
          AND NOT EXISTS (
            SELECT 1
            FROM trace_media tm
            WHERE tm.project_id = m.project_id
              AND tm.media_id = m.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM observation_media om
            WHERE om.project_id = m.project_id
              AND om.media_id = m.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM dataset_item_media dim
            WHERE dim.project_id = m.project_id
              AND dim.media_id = m.id
              AND dim.dataset_item_valid_from IS NOT NULL
          )
      `;
    }
  });
};

export const processClickhouseTraceDelete = async (
  projectId: string,
  traceIds: string[],
) => {
  logger.info(
    `Deleting traces ${JSON.stringify(traceIds)} in project ${projectId} from Clickhouse`,
  );

  await deleteMediaItemsForTraces(projectId, traceIds);

  try {
    await Promise.all([
      env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG === "true"
        ? removeIngestionEventsFromS3AndDeleteClickhouseRefsForTraces({
            projectId,
            traceIds,
          })
        : Promise.resolve(),
      deleteTraces(projectId, traceIds),
      deleteObservationsByTraceIds(projectId, traceIds),
      deleteScoresByTraceIds(projectId, traceIds),
      v4WritesToEventsTable(env)
        ? deleteEventsByTraceIds(projectId, traceIds)
        : Promise.resolve(),
    ]);
  } catch (e) {
    logger.error(
      `Error deleting trace ${JSON.stringify(traceIds)} in project ${projectId} from Clickhouse`,
      e,
    );
    traceException(e);
    throw e;
  }
};
