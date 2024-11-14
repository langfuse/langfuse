import { randomUUID } from "crypto";

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

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Get Media Upload URL",
    bodySchema: GetMediaUploadUrlQuerySchema,
    responseSchema: GetMediaUploadUrlResponseSchema,
    successStatusCode: 201,
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
        return await prisma.$transaction<{
          mediaId: string;
          uploadUrl: null;
        }>(async (tx) => {
          if (observationId) {
            await tx.observationMedia.upsert({
              where: {
                projectId_traceId_observationId_mediaId_field: {
                  projectId,
                  traceId,
                  observationId,
                  mediaId: existingMedia.id,
                  field,
                },
              },
              update: {},
              create: {
                projectId,
                traceId,
                observationId,
                mediaId: existingMedia.id,
                field,
              },
            });
          } else {
            await tx.traceMedia.upsert({
              where: {
                projectId_traceId_mediaId_field: {
                  projectId,
                  traceId,
                  mediaId: existingMedia.id,
                  field,
                },
              },
              update: {},
              create: {
                projectId,
                traceId,
                field,
                mediaId: existingMedia.id,
              },
            });
          }

          return {
            mediaId: existingMedia.id,
            uploadUrl: null,
          };
        });
      }
      const mediaId = existingMedia?.id ?? randomUUID();

      if (
        !(
          env.LANGFUSE_S3_MEDIA_UPLOAD_ENABLED &&
          env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET
        )
      )
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

      return await prisma.$transaction<{
        mediaId: string;
        uploadUrl: string;
      }>(async (tx) => {
        if (!env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET)
          throw new InternalServerError(
            "Media upload to bucket not configured",
          );

        await Promise.all([
          tx.media.upsert({
            where: {
              projectId_sha256Hash: {
                projectId,
                sha256Hash,
              },
            },
            update: {
              bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
              bucketPath,
              contentType,
              contentLength,
            },
            create: {
              id: mediaId,
              projectId,
              sha256Hash,
              bucketPath,
              bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
              contentType,
              contentLength,
            },
          }),
          observationId
            ? tx.observationMedia.upsert({
                where: {
                  projectId_traceId_observationId_mediaId_field: {
                    projectId,
                    traceId,
                    observationId,
                    mediaId,
                    field,
                  },
                },
                update: {},
                create: {
                  projectId,
                  traceId,
                  observationId,
                  mediaId,
                  field,
                },
              })
            : tx.traceMedia.upsert({
                where: {
                  projectId_traceId_mediaId_field: {
                    projectId,
                    traceId,
                    mediaId,
                    field,
                  },
                },
                update: {},
                create: {
                  projectId,
                  traceId,
                  field,
                  mediaId,
                },
              }),
        ]);

        return {
          mediaId,
          uploadUrl,
        };
      });
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
