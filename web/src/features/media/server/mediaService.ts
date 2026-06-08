import { createHash, randomUUID } from "crypto";

import { env } from "@/src/env.mjs";
import { getFileExtensionFromContentType } from "@/src/features/media/server/getFileExtensionFromContentType";
import { getMediaStorageServiceClient } from "@/src/features/media/server/getMediaStorageClient";
import {
  GetMediaResponseSchema,
  type GetMediaUploadUrlQuery,
  GetMediaUploadUrlResponseSchema,
  type MediaContentType,
  type PatchMediaBody,
} from "@/src/features/media/validation";
import { InternalServerError, LangfuseNotFoundError } from "@langfuse/shared";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import {
  getCurrentSpan,
  logger,
  recordHistogram,
  recordIncrement,
  redis,
} from "@langfuse/shared/src/server";

type MediaLinkTarget = "trace" | "observation";
type MediaLinkParams = {
  projectId: string;
  traceId: string;
  observationId?: string | null;
  mediaId: string;
  field: string;
};

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
    field,
  } = body;

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
      await linkMediaToTraceOrObservation({
        projectId,
        traceId,
        observationId,
        mediaId,
        field,
      });

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

    const bucketPath = getBucketPath({ projectId, mediaId, contentType });
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

    await linkMediaToTraceOrObservation({
      projectId,
      traceId,
      observationId,
      mediaId,
      field,
    });

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

async function upsertMediaRecord(params: {
  mediaId: string;
  projectId: string;
  sha256Hash: string;
  bucketPath: string;
  uploadBucket: string;
  contentType: MediaContentType;
  contentLength: number;
}) {
  const {
    mediaId,
    projectId,
    sha256Hash,
    bucketPath,
    uploadBucket,
    contentType,
    contentLength,
  } = params;
  const maxRetries = 3;
  const delayMs = 100;

  for (let retryCount = 0; retryCount < maxRetries; retryCount += 1) {
    try {
      await prisma.$queryRaw`
        INSERT INTO "media" (
            "id",
            "project_id",
            "sha_256_hash",
            "bucket_path",
            "bucket_name",
            "content_type",
            "content_length"
          )
          VALUES (
            ${mediaId},
            ${projectId},
            ${sha256Hash},
            ${bucketPath},
            ${uploadBucket},
            ${contentType},
            ${contentLength}
          )
          ON CONFLICT ("project_id", "sha_256_hash")
          DO UPDATE SET
            "bucket_name" = ${uploadBucket},
            "bucket_path" = ${bucketPath},
            "content_type" = ${contentType},
            "content_length" = ${contentLength}
        `;
      return;
    } catch (error) {
      if (retryCount === maxRetries - 1) throw error;

      logger.debug(
        `Failed to create media record. Retrying (${retryCount + 1}/${maxRetries})...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function linkMediaToTraceOrObservation(params: MediaLinkParams) {
  const { projectId, traceId, observationId, mediaId, field } = params;
  const target: MediaLinkTarget = observationId ? "observation" : "trace";
  const cacheKey = await getMediaLinkCacheKeyIfWriteAllowed(params, target);

  // Return early if DB write is not allowed by cache
  if (cacheKey === null) return;

  try {
    if (observationId) {
      await prisma.$queryRaw`
        INSERT INTO "observation_media" ("id", "project_id", "trace_id", "observation_id", "media_id", "field")
        VALUES (${randomUUID()}, ${projectId}, ${traceId}, ${observationId}, ${mediaId}, ${field})
        ON CONFLICT DO NOTHING;
      `;

      return;
    }

    await prisma.$queryRaw`
      INSERT INTO "trace_media" ("id", "project_id", "trace_id", "media_id", "field")
      VALUES (${randomUUID()}, ${projectId}, ${traceId}, ${mediaId}, ${field})
      ON CONFLICT DO NOTHING;
    `;
  } catch (error) {
    await clearMediaLinkCacheKey(cacheKey);

    throw error;
  }
}

async function getMediaLinkCacheKeyIfWriteAllowed(
  params: MediaLinkParams,
  target: MediaLinkTarget,
): Promise<string | null | undefined> {
  const ttlSeconds = env.LANGFUSE_MEDIA_LINK_REQUEST_DEDUP_TTL_SECONDS;

  if (!redis || ttlSeconds === 0) {
    return undefined;
  }

  const cacheKey = getMediaLinkCacheKey(params, target);

  try {
    const result = await redis.set(cacheKey, "1", "EX", ttlSeconds, "NX");

    if (result !== "OK") {
      recordIncrement("langfuse.media.link.dedup_cache_hit", 1, { target });

      return null;
    }

    recordIncrement("langfuse.media.link.dedup_cache_miss", 1, { target });

    return cacheKey;
  } catch (error) {
    recordIncrement("langfuse.media.link.dedup_cache_error", 1, { target });
    logger.warn(
      "Failed to check media link deduplication cache. Continuing with database write.",
      error,
    );

    return undefined;
  }
}

async function clearMediaLinkCacheKey(cacheKey: string | undefined) {
  if (!cacheKey || !redis) return;

  try {
    await redis.del(cacheKey);
  } catch (error) {
    logger.warn("Failed to clear media link deduplication cache key.", error);
  }
}

function getMediaLinkCacheKey(
  params: MediaLinkParams,
  target: MediaLinkTarget,
) {
  const { projectId, traceId, observationId, mediaId, field } = params;
  const cachePayload =
    target === "observation"
      ? [target, projectId, traceId, observationId, mediaId, field]
      : [target, projectId, traceId, mediaId, field];

  const hash = createHash("sha256")
    .update(JSON.stringify(cachePayload))
    .digest("base64url");

  return `langfuse:media-link:${target}:${hash}`;
}

function getBucketPath(params: {
  projectId: string;
  mediaId: string;
  contentType: MediaContentType;
}) {
  const { projectId, mediaId, contentType } = params;
  const prefix = env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX ?? "";
  const fileExtension = getFileExtensionFromContentType(contentType);

  return `${prefix}${projectId}/${mediaId}.${fileExtension}`;
}

function getMediaId(sha256Hash: string) {
  const urlSafeHash = sha256Hash.replaceAll("+", "-").replaceAll("/", "_");

  return urlSafeHash.slice(0, 22);
}
