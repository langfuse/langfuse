import { z } from "zod";

import { env } from "@/src/env.mjs";
import { getMediaStorageServiceClient } from "@/src/features/media/server/getMediaStorageClient";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import {
  type MediaContentType,
  type MediaReturnType,
} from "@/src/features/media/server";
import { type MediaEnabledFields } from "@/src/features/media/validation";
import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";
import { resolveExternalMediaUrl } from "@/src/features/blobstorage-integration/externalMediaService";
import { InvalidRequestError } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";

export const mediaRouter = createTRPCRouter({
  resolveExternalMedia: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), uri: z.string() }))
    .query(async ({ input, ctx }) => {
      const projectId = ctx.session.projectId;
      const isEnabled =
        ctx.session.environment.enableExperimentalFeatures ||
        getContextualFeatureFlags(ctx.session.user, {
          projectId,
        })?.externalMediaStorage === true;
      if (!isEnabled) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      try {
        return await resolveExternalMediaUrl({
          prisma: ctx.prisma,
          projectId,
          uri: input.uri,
        });
      } catch (error) {
        if (!(error instanceof InvalidRequestError)) {
          logger.error("Unexpected external media resolution failure", {
            projectId,
            operation: "media.resolveExternalMedia",
            errorType: error instanceof Error ? error.name : typeof error,
          });
        }
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "External media is not available",
        });
      }
    }),

  getById: protectedProjectProcedure
    .input(z.object({ mediaId: z.string(), projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { projectId, mediaId } = input;

      const media = await ctx.prisma.media.findUnique({
        where: {
          projectId_id: {
            projectId,
            id: mediaId,
          },
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
      if (!(media.uploadHttpStatus === 200 || media.uploadHttpStatus === 201))
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Media upload failed`,
        });

      const mediaStorageClient = getMediaStorageServiceClient(media.bucketName);
      const ttlSeconds = env.LANGFUSE_S3_MEDIA_DOWNLOAD_URL_EXPIRY_SECONDS;
      const urlExpiry = new Date(Date.now() + ttlSeconds * 1000).toISOString();

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
    }),
  getByTraceOrObservationId: protectedProjectProcedure
    .input(
      z.object({
        traceId: z.string(),
        observationId: z.string().nullish(),
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { projectId, traceId } = input;

      let media: {
        id: string;
        field: MediaEnabledFields;
        bucket_name: string;
        bucket_path: string;
        content_type: string;
        content_length: bigint;
      }[] = [];

      if (!input.observationId) {
        // Get all media on the trace IO. This is NOT all media on the observations belonging to the trace.
        media = await ctx.prisma.$queryRaw<
          {
            id: string;
            field: MediaEnabledFields;
            bucket_name: string;
            bucket_path: string;
            content_type: string;
            content_length: bigint;
          }[]
        >`
            SELECT
              tm.field,
              m.id,
              m.bucket_name,
              m.bucket_path,
              m.content_type,
              m.content_length
            FROM
              trace_media tm
              INNER JOIN media m
                ON tm.media_id = m.id 
                AND tm.project_id = m.project_id
            WHERE
              tm.project_id = ${projectId}
              AND tm.trace_id = ${traceId}
          `;
      } else {
        media = await ctx.prisma.$queryRaw<
          {
            id: string;
            field: MediaEnabledFields;
            bucket_name: string;
            bucket_path: string;
            content_type: string;
            content_length: bigint;
          }[]
        >`
            SELECT
              om.field,
              m.id,
              m.bucket_name,
              m.bucket_path,
              m.content_type,
              m.content_length
            FROM
              observation_media om
              INNER JOIN media m
                ON om.media_id = m.id 
                AND om.project_id = m.project_id
            WHERE
              om.project_id = ${projectId}
              AND om.trace_id = ${traceId}
              AND om.observation_id = ${input.observationId}
          `;
      }

      if (!media.length) {
        return [];
      }

      const mediaStorageClient = getMediaStorageServiceClient(
        media[0].bucket_name,
      );
      const ttlSeconds = env.LANGFUSE_S3_MEDIA_DOWNLOAD_URL_EXPIRY_SECONDS;
      const urlExpiry = new Date(Date.now() + ttlSeconds * 1000).toISOString();

      // Use Promise.all as better to fail all media requests than one of them only
      return await Promise.all(
        media.map<Promise<MediaReturnType>>(async (m) => {
          const url = await mediaStorageClient.getSignedUrl(
            m.bucket_path,
            ttlSeconds,
            false,
          );
          return {
            mediaId: m.id,
            contentType: m.content_type as MediaContentType,
            contentLength: Number(m.content_length),
            field: m.field,
            url,
            urlExpiry,
          };
        }),
      );
    }),
});
