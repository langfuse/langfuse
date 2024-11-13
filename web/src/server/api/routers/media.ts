import { z } from "zod";

import { env } from "@/src/env.mjs";
import { getMediaStorageServiceClient } from "@/src/features/media/server/getMediaStorageClient";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

export const mediaRouter = createTRPCRouter({
  get: protectedProjectProcedure
    .input(z.object({ mediaId: z.string(), projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        const { projectId, mediaId } = input;

        const media = await ctx.prisma.media.findFirst({
          where: {
            projectId,
            id: mediaId,
          },
        });

        if (!media)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Media asset not found",
          });
        if (!media.uploadHttpStatus)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Media not yet uploaded",
          });
        if (media.uploadHttpStatus !== 200)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Media upload failed`,
          });

        const mediaStorageClient = getMediaStorageServiceClient(
          media.bucketName,
        );
        const ttlSeconds = env.LANGFUSE_S3_MEDIA_DOWNLOAD_URL_EXPIRY_SECONDS;
        const urlExpiry = new Date(
          Date.now() + ttlSeconds * 1000,
        ).toISOString();

        const url = await mediaStorageClient.getSignedUrl(
          media.bucketPath,
          ttlSeconds,
          false,
        );

        return {
          mediaId,
          contentType: media.contentType,
          contentLength: Number(media.contentLength),
          url,
          urlExpiry,
        };
      } catch (e) {
        logger.error(e);
        if (e instanceof TRPCError) {
          throw e;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching media failed.",
        });
      }
    }),
});
