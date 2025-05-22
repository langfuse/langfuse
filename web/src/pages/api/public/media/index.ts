import { randomUUID } from "crypto";

import { env } from "@/src/env.mjs";
import { getFileExtensionFromContentType } from "@/src/features/media/server/getFileExtensionFromContentType";
import { getMediaStorageServiceClient } from "@/src/features/media/server/getMediaStorageClient";
import {
  GetMediaUploadUrlQuerySchema,
  GetMediaUploadUrlResponseSchema,
  type MediaContentType,
} from "@/src/features/media/validation";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  ForbiddenError,
  InternalServerError,
  InvalidRequestError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { logger, instrumentAsync } from "@langfuse/shared/src/server";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Get Media Upload URL",
    bodySchema: GetMediaUploadUrlQuerySchema,
    responseSchema: GetMediaUploadUrlResponseSchema,
    successStatusCode: 201,
    rateLimitResource: "ingestion",
    fn: async ({ body, auth }) => {
      if (auth.scope.accessLevel !== "project") throw new ForbiddenError();

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

      return await instrumentAsync(
        { name: "media-create-upload-url" },
        async (span) => {
          span.setAttribute("projectId", projectId);
          span.setAttribute("traceId", traceId);
          span.setAttribute("observationId", observationId ?? "");
          span.setAttribute("field", field);
          span.setAttribute("sha256Hash", sha256Hash);

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
              span.setAttribute("mediaId", existingMedia.id);

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

            const mediaId = existingMedia?.id ?? getMediaId({ sha256Hash });

            span.setAttribute("mediaId", mediaId);

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
            // Under high concurrency, the upsert might fail due to the multiple uniqueness constraints
            // (id and (project_id ad sha_256))
            // See also: https://stackoverflow.com/questions/73164161/insert-on-conflict-do-update-set-an-upsert-statement-with-a-unique-constraint
            const maxRetries = 3;
            const delayMs = 100;
            let retryCount = 0;

            while (retryCount < maxRetries) {
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
                break;
              } catch (e) {
                retryCount += 1;

                if (retryCount >= maxRetries) throw e;

                logger.debug(
                  `Failed to create media record. Retrying (${retryCount}/${maxRetries})...`,
                );

                await new Promise((resolve) => setTimeout(resolve, delayMs));
              }
            }

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
      );
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

function getMediaId(params: { sha256Hash: string }) {
  const { sha256Hash } = params;

  // Make hash URL safe
  const urlSafeHash = sha256Hash.replaceAll("+", "-").replaceAll("/", "_");

  // Get first 132 bits, i.e. first 22 base64Url chars
  return urlSafeHash.slice(0, 22);
}
