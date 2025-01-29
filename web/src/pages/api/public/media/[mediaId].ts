import { z } from "zod";

import { env } from "@/src/env.mjs";
import { getMediaStorageServiceClient } from "@/src/features/media/server/getMediaStorageClient";
import {
  GetMediaQuerySchema,
  GetMediaResponseSchema,
  PatchMediaBodySchema,
} from "@/src/features/media/validation";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  ForbiddenError,
  InternalServerError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { recordIncrement, recordHistogram } from "@langfuse/shared/src/server";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Media data",
    querySchema: GetMediaQuerySchema,
    responseSchema: GetMediaResponseSchema,
    fn: async ({ query, auth }) => {
      if (auth.scope.accessLevel !== "all") throw new ForbiddenError();

      const { projectId } = auth.scope;
      const { mediaId } = query;

      const media = await prisma.media.findFirst({
        where: {
          projectId,
          id: mediaId,
        },
      });

      if (!media) throw new LangfuseNotFoundError("Media asset not found");
      if (!media.uploadHttpStatus)
        throw new LangfuseNotFoundError("Media not yet uploaded");
      if (!(media.uploadHttpStatus === 200 || media.uploadHttpStatus === 201))
        throw new LangfuseNotFoundError(
          `Media upload failed with status ${media.uploadHttpStatus}: \n ${media.uploadHttpError}`,
        );

      const mediaStorageClient = getMediaStorageServiceClient(media.bucketName);
      const ttlSeconds = env.LANGFUSE_S3_MEDIA_DOWNLOAD_URL_EXPIRY_SECONDS;
      const urlExpiry = new Date(Date.now() + ttlSeconds * 1000).toISOString();

      const url = await mediaStorageClient.getSignedUrl(
        media.bucketPath,
        ttlSeconds,
        false,
      );

      const { contentType, contentLength, uploadedAt } = media;

      return {
        mediaId,
        contentType,
        contentLength: Number(contentLength),
        url,
        urlExpiry,
        uploadedAt,
      };
    },
  }),

  PATCH: createAuthedAPIRoute({
    name: "Update Media Uploaded At",
    querySchema: z.object({
      mediaId: z.string(),
    }),
    bodySchema: PatchMediaBodySchema,
    responseSchema: z.void(),
    rateLimitResource: "ingestion",
    fn: async ({ query, body, auth }) => {
      if (auth.scope.accessLevel !== "all") throw new ForbiddenError();

      const { projectId } = auth.scope;
      const { mediaId } = query;
      const { uploadedAt, uploadHttpStatus, uploadHttpError, uploadTimeMs } =
        body;

      try {
        await prisma.media.update({
          where: {
            projectId,
            id: mediaId,
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
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2025"
        ) {
          /* https://www.prisma.io/docs/orm/reference/error-reference#p2025
           * An operation failed because it depends on one or more records that were required but not found.
           */
          throw new LangfuseNotFoundError(
            `Media asset ${mediaId} not found in project ${projectId}`,
          );
        }

        throw new InternalServerError(
          `Error updating uploadedAt on media ID ${mediaId}` +
          (e instanceof Error ? e.message : "")
            ? (e as Error).message
            : "",
        );
      }
    },
  }),
});
