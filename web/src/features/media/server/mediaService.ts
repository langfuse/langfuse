import { env } from "@/src/env.mjs";
import { getMediaStorageServiceClient } from "@/src/features/media/server/getMediaStorageClient";
import {
  GetMediaResponseSchema,
  type GetMediaUploadUrlQuery,
  GetMediaUploadUrlResponseSchema,
  type PatchMediaBody,
} from "@/src/features/media/validation";
import {
  type DatasetItemMediaField,
  InternalServerError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import {
  declarePendingDatasetItemMedia,
  getMediaBucketPath,
  getMediaId,
  getCurrentSpan,
  linkMediaToTraceOrObservation,
  logger,
  recordHistogram,
  recordIncrement,
  upsertMediaRecord,
} from "@langfuse/shared/src/server";

export async function createMediaUploadUrl(params: {
  projectId: string;
  body: GetMediaUploadUrlQuery;
}) {
  const { projectId, body } = params;
  const {
    contentType,
    contentLength,
    sha256Hash,
    traceId,
    observationId,
    datasetId,
    datasetItemId,
    field,
  } = body;

  const linkUploadedMedia = (mediaId: string) => {
    if (datasetId && datasetItemId) {
      return declarePendingDatasetItemMedia({
        projectId,
        datasetId,
        datasetItemId,
        mediaId,
        field: field as DatasetItemMediaField,
      });
    }
    // Validation guarantees a trace context here (traceId + field).
    if (traceId && field) {
      return linkMediaToTraceOrObservation({
        projectId,
        traceId,
        observationId,
        mediaId,
        field,
      });
    }
  };

  try {
    const existingMedia = await prisma.media.findUnique({
      where: {
        projectId_sha256Hash: {
          projectId,
          sha256Hash,
        },
      },
    });

    const mediaId = existingMedia?.id ?? getMediaId(sha256Hash);
    getCurrentSpan()?.setAttribute("mediaId", mediaId);

    if (
      existingMedia &&
      existingMedia.uploadHttpStatus === 200 &&
      existingMedia.contentType === contentType
    ) {
      await linkUploadedMedia(mediaId);

      return GetMediaUploadUrlResponseSchema.parse({
        mediaId,
        uploadUrl: null,
      });
    }

    const uploadBucket = env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET;

    if (!uploadBucket) {
      throw new InternalServerError(
        "Media upload to blob storage not enabled or no bucket configured",
      );
    }

    const bucketPath = getMediaBucketPath({
      projectId,
      mediaId,
      contentType,
      prefix: env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX ?? "",
    });
    const uploadUrl = await getMediaStorageServiceClient(
      uploadBucket,
    ).getSignedUploadUrl({
      path: bucketPath,
      ttlSeconds: 60 * 60,
      sha256Hash,
      contentType,
      contentLength,
    });

    await upsertMediaRecord({
      mediaId,
      projectId,
      sha256Hash,
      bucketPath,
      uploadBucket,
      contentType,
      contentLength,
    });

    await linkUploadedMedia(mediaId);

    return GetMediaUploadUrlResponseSchema.parse({ mediaId, uploadUrl });
  } catch (error) {
    if (error instanceof InternalServerError) throw error;

    logger.error(
      `Failed to get media upload URL for trace ${traceId} and observation ${observationId}.`,
    );
    throw new InternalServerError("Failed to get media upload URL");
  }
}

export async function getMedia(params: { projectId: string; mediaId: string }) {
  const { projectId, mediaId } = params;
  const media = await prisma.media.findUnique({
    where: {
      projectId_id: {
        projectId,
        id: mediaId,
      },
    },
  });

  if (!media) throw new LangfuseNotFoundError("Media asset not found");
  if (!media.uploadHttpStatus) {
    throw new LangfuseNotFoundError("Media not yet uploaded");
  }
  if (!(media.uploadHttpStatus === 200 || media.uploadHttpStatus === 201)) {
    throw new LangfuseNotFoundError(
      `Media upload failed with status ${media.uploadHttpStatus}: \n ${media.uploadHttpError}`,
    );
  }

  const ttlSeconds = env.LANGFUSE_S3_MEDIA_DOWNLOAD_URL_EXPIRY_SECONDS;
  const url = await getMediaStorageServiceClient(media.bucketName).getSignedUrl(
    media.bucketPath,
    ttlSeconds,
    false,
  );

  return GetMediaResponseSchema.parse({
    mediaId,
    contentType: media.contentType,
    contentLength: Number(media.contentLength),
    uploadedAt: media.uploadedAt,
    url,
    urlExpiry: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  });
}

export async function updateMediaUploadStatus(params: {
  projectId: string;
  mediaId: string;
  body: PatchMediaBody;
}) {
  const { projectId, mediaId, body } = params;
  const { uploadedAt, uploadHttpStatus, uploadHttpError, uploadTimeMs } = body;

  try {
    await prisma.media.update({
      where: {
        projectId_id: {
          projectId,
          id: mediaId,
        },
      },
      data: {
        uploadedAt,
        uploadHttpStatus,
        uploadHttpError: uploadHttpStatus === 200 ? null : uploadHttpError,
      },
    });

    recordIncrement("langfuse.media.upload_http_status", 1, {
      status_code: uploadHttpStatus,
    });

    if (uploadTimeMs) {
      recordHistogram("langfuse.media.upload_time_ms", uploadTimeMs, {
        status_code: uploadHttpStatus,
      });
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new LangfuseNotFoundError(
        `Media asset ${mediaId} not found in project ${projectId}`,
      );
    }

    const message = error instanceof Error ? error.message : "";
    throw new InternalServerError(
      `Error updating uploadedAt on media ID ${mediaId}: ${message}`,
    );
  }
}
