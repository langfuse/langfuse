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
  Prisma,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { instrumentAsync } from "@langfuse/shared/src/server";

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

      // Retry up to 3 times to avoid race conditions for concurrent media uploads
      // Multiple observations can reference the same media, so we need to make sure no deadlock occurs
      const MAX_RETRIES = 6;
      let retries = 0;

      return await instrumentAsync(
        { name: "media-create-upload-url" },
        async (span) => {
          span.setAttribute("projectId", projectId);
          span.setAttribute("traceId", traceId);
          span.setAttribute("observationId", observationId ?? "");
          span.setAttribute("field", field);

          while (retries < MAX_RETRIES) {
            try {
              return await prisma.$transaction<{
                mediaId: string;
                uploadUrl: string | null;
              }>(
                async (tx) => {
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
                  }

                  const mediaId = existingMedia?.id ?? randomUUID();
                  span.setAttribute("mediaId", mediaId);

                  if (
                    !(
                      env.LANGFUSE_S3_MEDIA_UPLOAD_ENABLED === "true" &&
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
                },
                {
                  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                },
              );
            } catch (error) {
              if (
                // See https://www.prisma.io/docs/orm/prisma-client/queries/transactions#transaction-timing-issues
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2034"
              ) {
                retries++;
                continue;
              }

              throw error;
            }
          }

          throw new InternalServerError("Failed to get media upload URL");
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
