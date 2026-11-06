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
  isBaseError,
  LangfuseNotFoundError,
  MediaAssociationOrigin,
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
        origin: MediaAssociationOrigin.CLIENT_UPLOAD,
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
      (existingMedia.uploadHttpStatus === 200 ||
        existingMedia.uploadHttpStatus === 201) &&
      existingMedia.contentType === contentType
    ) {
      // A stored 200 is itself a client attestation (see
      // verifyMediaUploadCompletion). Re-verify against storage before letting
      // this upload link to the existing asset, so a row marked complete with
      // mismatched or missing content cannot capture a colleague's upload.
      await verifyMediaUploadCompletion({
        projectId,
        mediaId: existingMedia.id,
        uploadHttpStatus: existingMedia.uploadHttpStatus,
      });

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
    if (isBaseError(error)) throw error;

    logger.error("Failed to get media upload URL", error);
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

/**
 * Server-side completion check for a media upload. The client attests the HTTP
 * status of its own PUT to object storage; the status alone must never mark an
 * asset complete, because a project key can PUT arbitrary bytes under the SAS
 * URL (Azure binds neither content length nor checksum in the SAS) and then
 * attest success. Verifying at completion means the blob must exist in the
 * bucket and match the declared content length before the media row can be
 * linked into (projectId, sha256Hash, contentType) dedup.
 *
 * Returns the verified content length, or undefined when the client did not
 * report success (nothing to verify).
 */
export async function verifyMediaUploadCompletion(params: {
  projectId: string;
  mediaId: string;
  uploadHttpStatus: number;
}): Promise<number | undefined> {
  const { projectId, mediaId, uploadHttpStatus } = params;
  if (uploadHttpStatus !== 200 && uploadHttpStatus !== 201) {
    return undefined;
  }

  const media = await prisma.media.findUnique({
    where: {
      projectId_id: {
        projectId,
        id: mediaId,
      },
    },
  });
  if (!media) {
    throw new LangfuseNotFoundError(
      `Media asset ${mediaId} not found in project ${projectId}`,
    );
  }

  const actualLength = await getMediaStorageServiceClient(
    media.bucketName,
  ).getObjectContentLength(media.bucketPath);

  if (actualLength === undefined) {
    logger.warn(
      `Media upload completion verified against a missing blob: ${media.bucketPath} (media ${mediaId})`,
    );
    throw new InternalServerError(
      `Media upload for ${mediaId} reported success, but the object is absent from storage`,
    );
  }

  const declaredLength = media.contentLength;
  if (actualLength !== Number(declaredLength)) {
    logger.warn(
      `Media upload completion length mismatch: media ${mediaId} declared ${declaredLength} bytes, storage reports ${actualLength}`,
    );
    throw new InternalServerError(
      `Media upload for ${mediaId} reported success, but the stored object length (${actualLength}) does not match the declared length (${declaredLength})`,
    );
  }

  return actualLength;
}

export async function updateMediaUploadStatus(params: {
  projectId: string;
  mediaId: string;
  body: PatchMediaBody;
}) {
  const { projectId, mediaId, body } = params;
  const { uploadedAt, uploadHttpStatus, uploadHttpError, uploadTimeMs } = body;

  try {
    // The client's status is an attestation, not evidence. Only a storage HEAD
    // that confirms existence and declared length lets a success status land.
    await verifyMediaUploadCompletion({ projectId, mediaId, uploadHttpStatus });

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
        uploadHttpError:
          uploadHttpStatus === 200 || uploadHttpStatus === 201
            ? null
            : uploadHttpError,
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
    // Langfuse base errors carry their own status and message; rethrow them
    // instead of masking them as generic 500s.
    if (error instanceof LangfuseNotFoundError) {
      throw error;
    }
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
