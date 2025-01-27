import { randomUUID } from "crypto";
import crypto from "node:crypto";

import { env } from "@/src/env.mjs";
import { getFileExtensionFromContentType } from "@/src/features/media/server/getFileExtensionFromContentType";
import { getMediaStorageServiceClient } from "@/src/features/media/server/getMediaStorageClient";
import {
  GetMediaUploadUrlQuerySchema,
  GetMediaUploadUrlResponseSchema,
  type MediaContentType,
} from "@/src/features/media/validation";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  ForbiddenError,
  InternalServerError,
  InvalidRequestError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Get Media Upload URL",
    bodySchema: GetMediaUploadUrlQuerySchema,
    responseSchema: GetMediaUploadUrlResponseSchema,
    successStatusCode: 201,
    rateLimitResource: "ingestion",
    fn: async ({ body, auth }) => {
      if (auth.scope.accessLevel !== "all") throw new ForbiddenError();

      const { projectId } = auth.scope;
      const {
        contentType,
        contentLength,
        sha256Hash,
        traceId,
        observationId,
        field,
      } = body;

      if (contentLength > env.LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH)
        throw new InvalidRequestError(
          `File size must be less than ${env.LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH} bytes`,
        );

      try {
        const existingMedia = await prisma.media.findUnique({
          where: {
            projectId_sha256Hash: {
              projectId,
              sha256Hash,
            },
          },
        });

        if (
          existingMedia &&
          existingMedia.uploadHttpStatus === 200 &&
          existingMedia.contentType === contentType
        ) {
          if (observationId) {
            // Use raw upserts to avoid deadlocks
            await prisma.$queryRaw`
              INSERT INTO "observation_media" ("id", "project_id", "trace_id", "observation_id", "media_id", "field")
              VALUES (${randomUUID()}, ${projectId}, ${traceId}, ${observationId}, ${existingMedia.id}, ${field})
              ON CONFLICT DO NOTHING;
            `;
          } else {
            // Use raw upserts to avoid deadlocks
            await prisma.$queryRaw`
              INSERT INTO "trace_media" ("id", "project_id", "trace_id", "media_id", "field")
              VALUES (${randomUUID()}, ${projectId}, ${traceId}, ${existingMedia.id}, ${field})
              ON CONFLICT DO NOTHING;
            `;
          }

          return {
            mediaId: existingMedia.id,
            uploadUrl: null,
          };
        }

        const mediaId = getMediaId({ projectId, sha256Hash });

        if (!env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET)
          throw new InternalServerError(
            "Media upload to blob storage not enabled or no bucket configured",
          );

        const s3Client = getMediaStorageServiceClient(
          env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
        );

        const bucketPath = getBucketPath({
          projectId,
          mediaId,
          contentType,
        });

        const uploadUrl = await s3Client.getSignedUploadUrl({
          path: bucketPath,
          ttlSeconds: 60 * 60, // 1 hour
          sha256Hash,
          contentType,
          contentLength,
        });

        // Create media record first to ensure fkey constraint is met on next queries
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
                ${env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET},
                ${contentType},
                ${contentLength}
              )
              ON CONFLICT ("project_id", "sha_256_hash") 
              DO UPDATE SET
                "bucket_name" = ${env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET},
                "bucket_path" = ${bucketPath},
                "content_type" = ${contentType},
                "content_length" = ${contentLength}
          `;

        if (observationId) {
          await prisma.$queryRaw`
                INSERT INTO "observation_media" ("id", "project_id", "trace_id", "observation_id", "media_id", "field")
                VALUES (${randomUUID()}, ${projectId}, ${traceId}, ${observationId}, ${mediaId}, ${field})
                ON CONFLICT DO NOTHING;
            `;
        } else {
          await prisma.$queryRaw`
                INSERT INTO "trace_media" ("id", "project_id", "trace_id", "media_id", "field")
                VALUES (${randomUUID()}, ${projectId}, ${traceId}, ${mediaId}, ${field})
                ON CONFLICT DO NOTHING;
            `;
        }

        return {
          mediaId,
          uploadUrl,
        };
      } catch (error) {
        logger.error(
          `Failed to get media upload URL for trace ${traceId} and observation ${observationId}.`,
        );
        throw new InternalServerError("Failed to get media upload URL");
      }
    },
  }),
});

function getBucketPath(params: {
  projectId: string;
  mediaId: string;
  contentType: MediaContentType;
}): string {
  const { projectId, mediaId, contentType } = params;
  const fileExtension = getFileExtensionFromContentType(contentType);

  const prefix = env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX
    ? `${env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX}`
    : "";

  return `${prefix}${projectId}/${mediaId}.${fileExtension}`;
}

function getMediaId(params: { projectId: string; sha256Hash: string }) {
  const { projectId, sha256Hash } = params;

  return crypto
    .createHash("sha256")
    .update(projectId + sha256Hash, "utf8")
    .digest("base64url")
    .slice(0, 22);
}
