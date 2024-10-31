import { z } from "zod";

import { env } from "@/src/env.mjs";
import {
  GetMediaQuerySchema,
  GetMediaResponseSchema,
  PatchMediaUploadedAtQuery,
} from "@/src/features/media/validation";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  ForbiddenError,
  InternalServerError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { getMediaStorageServiceClient } from "@/src/features/media/server/getMediaStorageClient";

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

      const mediaStorageClient = getMediaStorageServiceClient(media.bucketName);
      const ttlSeconds = env.LANGFUSE_S3_MEDIA_DOWNLOAD_URL_EXPIRY_SECONDS;
      const urlExpiry = new Date(Date.now() + ttlSeconds * 1000).toISOString();

      const url = await mediaStorageClient.getSignedUrl(
        media.bucketPath,
        ttlSeconds,
      );

      return {
        mediaId,
        contentType: media.contentType,
        url,
        urlExpiry,
      };
    },
  }),

  PATCH: createAuthedAPIRoute({
    name: "Update Media Uploaded At",
    querySchema: PatchMediaUploadedAtQuery,
    responseSchema: z.void(),
    fn: async ({ query, auth }) => {
      if (auth.scope.accessLevel !== "all") throw new ForbiddenError();

      const { projectId } = auth.scope;
      const { mediaId, uploadedAt } = query;

      try {
        await prisma.media.update({
          where: {
            projectId,
            id: mediaId,
          },
          data: {
            uploadedAt,
          },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2025"
        ) {
          /* https://www.prisma.io/docs/orm/reference/error-reference#p2025
           * An operation failed because it depends on one or more records that were required but not found.
           */
          throw new LangfuseNotFoundError("Media asset not found");
        }

        throw new InternalServerError(
          `Error updating uploadedAt on media ID ${mediaId}` + (e instanceof Error ? e.message : "")
          (e instanceof Error)
            ? (e as Error).message
            : "",
        );
      }
    },
  }),
});
