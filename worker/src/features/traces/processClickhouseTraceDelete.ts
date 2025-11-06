import {
  deleteObservationsByTraceIds,
  deleteScoresByTraceIds,
  deleteTraces,
  logger,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForTraces,
  StorageService,
  StorageServiceFactory,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { prisma } from "@langfuse/shared/src/db";
import { chunk } from "lodash";

let s3MediaStorageClient: StorageService;

const getS3MediaStorageClient = (bucketName: string): StorageService => {
  if (!s3MediaStorageClient) {
    s3MediaStorageClient = StorageServiceFactory.getInstance({
      bucketName,
      accessKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY,
      endpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_MEDIA_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE === "true",
      awsSse: env.LANGFUSE_S3_MEDIA_UPLOAD_SSE,
      awsSseKmsKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_SSE_KMS_KEY_ID,
    });
  }
  return s3MediaStorageClient;
};

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
        id: true,
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
        id: true,
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

  // Delete the junction table records in chunks
  await Promise.all([
    prisma.traceMedia.deleteMany({
      where: {
        projectId,
        id: {
          in: traceMediaItems.map((ref) => ref.id),
        },
      },
    }),
    prisma.observationMedia.deleteMany({
      where: {
        projectId,
        id: {
          in: observationMediaItems.map((ref) => ref.id),
        },
      },
    }),
  ]);

  // Phase 2: Delete orphaned media items using NOT EXISTS subquery
  if (allMediaIds.size === 0) {
    return;
  }

  const mediaIdChunks = chunk(Array.from(allMediaIds), 1000);

  for (const mediaIdChunk of mediaIdChunks) {
    // First, fetch media items that are orphaned (no references) to get their bucket paths
    const orphanedMedia = await prisma.media.findMany({
      select: {
        id: true,
        bucketPath: true,
      },
      where: {
        projectId,
        id: {
          in: mediaIdChunk,
        },
        TraceMedia: {
          none: {},
        },
        ObservationMedia: {
          none: {},
        },
      },
    });

    if (orphanedMedia.length > 0) {
      // Delete from S3
      await getS3MediaStorageClient(
        env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET ?? "", // Fallback is never used.
      ).deleteFiles(orphanedMedia.map((f) => f.bucketPath));

      // Delete from postgres
      await prisma.media.deleteMany({
        where: {
          projectId,
          id: {
            in: orphanedMedia.map((f) => f.id),
          },
        },
      });
    }
  }
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
