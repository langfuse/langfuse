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
  // First, find all records associated with the traces to be deleted
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

  // Find media items that will have no remaining references after deletion
  const mediaDeleteCandidates = await prisma.media.findMany({
    select: {
      id: true,
      bucketPath: true,
    },
    where: {
      projectId,
      id: {
        in: [...traceMediaItems, ...observationMediaItems].map(
          (ref) => ref.mediaId,
        ),
      },
      TraceMedia: {
        every: {
          id: {
            in: traceMediaItems.map((ref) => ref.id),
          },
        },
      },
      ObservationMedia: {
        every: {
          id: {
            in: observationMediaItems.map((ref) => ref.id),
          },
        },
      },
    },
  });

  // Remove the media items that will have no remaining references
  if (mediaDeleteCandidates.length > 0) {
    // Delete from Cloud Storage
    await getS3MediaStorageClient(
      env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET ?? "", // Fallback is never used.
    ).deleteFiles(mediaDeleteCandidates.map((f) => f.bucketPath));

    // Delete from postgres
    await prisma.media.deleteMany({
      where: {
        id: {
          in: mediaDeleteCandidates.map((f) => f.id),
        },
        projectId,
      },
    });
  }

  // Remove all traceMedia and observationMedia items that we found earlier
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
};

export const processClickhouseTraceDelete = async (
  projectId: string,
  traceIds: string[],
) => {
  logger.info(
    `Deleting traces ${JSON.stringify(traceIds)} in project ${projectId} from Clickhouse`,
  );

  await deleteMediaItemsForTraces(projectId, traceIds);

  await removeIngestionEventsFromS3AndDeleteClickhouseRefsForTraces({
    projectId,
    traceIds,
  });

  try {
    await Promise.all([
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
