import { randomUUID } from "crypto";

import { env } from "@/src/env.mjs";
import {
  GetMediaUploadUrlQuerySchema,
  GetMediaUploadUrlResponseSchema,
} from "@/src/features/media/validation";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { ForbiddenError, InternalServerError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { getMediaStorageServiceClient } from "@/src/features/media/server/getMediaStorageClient";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Get Media Upload URL",
    bodySchema: GetMediaUploadUrlQuerySchema,
    responseSchema: GetMediaUploadUrlResponseSchema,
    successStatusCode: 201,
    fn: async ({ body, auth }) => {
      if (auth.scope.accessLevel !== "all") throw new ForbiddenError();

      const { projectId } = auth.scope;
      const { contentType, sha256Hash, traceId, observationId, field } = body;

      const { mediaId, uploadUrl } = await prisma.$transaction(async (tx) => {
        const existingMedia = await tx.media.findUnique({
          where: {
            projectId_sha256Hash: {
              projectId,
              sha256Hash,
            },
          },
        });

        if (existingMedia) {
          await tx.traceMedia.create({
            data: {
              projectId,
              traceId,
              observationId,
              field,
              mediaId: existingMedia.id,
            },
          });

          return {
            mediaId: existingMedia.id,
            uploadUrl: null,
          };
        }

        const mediaId = randomUUID();

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
        });

        const uploadUrl = await s3Client.getSignedUploadUrl({
          path: bucketPath,
          ttlSeconds: 60 * 60, // 1 hour
        });

        await Promise.all([
          tx.media.create({
            data: {
              id: mediaId,
              projectId,
              sha256Hash,
              bucketPath,
              bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
              contentType,
            },
          }),
          tx.traceMedia.create({
            data: {
              projectId,
              traceId,
              observationId,
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

      return {
        uploadUrl,
        mediaId,
      };
    },
  }),
});

function getBucketPath(params: { projectId: string; mediaId: string }): string {
  const { projectId, mediaId } = params;

  const prefix = env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX
    ? `${env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX}`
    : "";

  return `${prefix}${projectId}/${mediaId}`;
}
