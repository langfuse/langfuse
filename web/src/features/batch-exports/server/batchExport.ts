import { auditLog } from "@/src/features/audit-logs/auditLog";
import { env } from "@/src/env.mjs";
import { parseBatchExportFileKeyFromUrl } from "@/src/features/batch-exports/server/batchExportFileKey";
import { getBatchExportStorageServiceClient } from "@/src/features/batch-exports/server/getBatchExportStorageClient";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  BatchExportStatus,
  BatchExportTableName,
  CreateBatchExportSchema,
  InvalidRequestError,
  LangfuseNotFoundError,
  paginationZod,
} from "@langfuse/shared";
import {
  BatchExportQueue,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertLegacyTracingIoSearchCanCreateBatchJob } from "@/src/features/traces/server/legacyIoSearch";

// Fallback for legacy rows that predate the worker stamping expiresAt;
// matches the worker's BATCH_EXPORT_DOWNLOAD_LINK_EXPIRATION_HOURS default.
const LEGACY_DOWNLOAD_WINDOW_MS = 24 * 60 * 60 * 1000;

// The fresh URL only needs to cover the click-through: object stores check
// signature expiry when the request starts, not while the download streams.
const FRESH_DOWNLOAD_URL_TTL_SECONDS = 10 * 60;

const isDownloadWindowExpired = (batchExport: {
  finishedAt: Date | null;
  expiresAt: Date | null;
}): boolean => {
  const expiresAt =
    batchExport.expiresAt ??
    (batchExport.finishedAt
      ? new Date(batchExport.finishedAt.getTime() + LEGACY_DOWNLOAD_WINDOW_MS)
      : null);
  return expiresAt !== null && expiresAt < new Date();
};

export const batchExportRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateBatchExportSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Check permissions, esp. projectId
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "batchExports:create",
        });

        const { projectId, format, name } = input;

        // Snapshot the user's v4 beta flag into the persisted query so the
        // worker reads events-aware data sources from the dispatch-time
        // snapshot, never the live user record. Overrides any client-sent value.
        const query = {
          ...input.query,
          useEventsTable: ctx.session.user.v4BetaEnabled ?? false,
        };

        if (query.tableName === BatchExportTableName.AuditLogs) {
          throwIfNoEntitlement({
            entitlement: "audit-logs",
            sessionUser: ctx.session.user,
            projectId,
          });
          throwIfNoProjectAccess({
            session: ctx.session,
            projectId,
            scope: "auditLogs:read",
          });
        }

        assertLegacyTracingIoSearchCanCreateBatchJob({
          searchQuery: query.searchQuery,
          searchType: query.searchType,
          tableName: query.tableName,
        });

        logger.info("[BATCH EXPORT] Creating export job", { job: input });
        const userId = ctx.session.user.id;

        // Create export job
        const exportJob = await ctx.prisma.batchExport.create({
          data: {
            projectId,
            userId,
            status: BatchExportStatus.QUEUED,
            name,
            format,
            query,
          },
        });

        // Create audit log
        await auditLog({
          session: ctx.session,
          resourceType: "batchExport",
          resourceId: exportJob.id,
          projectId,
          action: "create",
          after: exportJob,
        });

        // Notify worker
        await BatchExportQueue.getInstance()?.add(QueueJobs.BatchExportJob, {
          id: exportJob.id, // Use the batchExportId to deduplicate when the same job is sent multiple times
          name: QueueJobs.BatchExportJob,
          timestamp: new Date(),
          payload: {
            batchExportId: exportJob.id,
            projectId,
          },
        });
      } catch (e) {
        logger.error("[BATCH EXPORT] Failed to create export job", e);
        if (e instanceof TRPCError) {
          throw e;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Creating export job failed.",
        });
      }
    }),
  cancel: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        batchExportId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "batchExports:create",
      });

      await ctx.prisma.batchExport.update({
        where: { id: input.batchExportId, projectId: input.projectId },
        data: { status: BatchExportStatus.CANCELLED },
      });
    }),
  downloadUrl: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        batchExportId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "batchExports:read",
      });

      const batchExport = await ctx.prisma.batchExport.findFirst({
        where: { id: input.batchExportId, projectId: input.projectId },
      });
      if (!batchExport) {
        throw new LangfuseNotFoundError("Batch export not found");
      }
      if (
        batchExport.status !== BatchExportStatus.COMPLETED ||
        !batchExport.url
      ) {
        throw new InvalidRequestError("Batch export is not ready for download");
      }
      if (isDownloadWindowExpired(batchExport)) {
        throw new InvalidRequestError(
          "The download window for this batch export has expired",
        );
      }

      await auditLog({
        session: ctx.session,
        resourceType: "batchExport",
        resourceId: batchExport.id,
        projectId: input.projectId,
        action: "download",
      });

      // The URL stored at export completion is signed with the worker's
      // credentials; when those are temporary (e.g. IAM role sessions) the
      // stored URL dies with the session, long before expiresAt. Re-sign a
      // fresh short-lived URL from the object key instead.
      const bucketName = env.LANGFUSE_S3_BATCH_EXPORT_BUCKET;
      if (bucketName) {
        const fileKey = parseBatchExportFileKeyFromUrl(
          batchExport.url,
          bucketName,
        );
        if (fileKey) {
          // asAttachment must be explicit: S3 defaults it to true, but GCS
          // and Azure don't — and the client navigates to this URL in the
          // same tab, so without a Content-Disposition header the browser
          // would render the export instead of downloading it.
          const url = await getBatchExportStorageServiceClient(
            bucketName,
          ).getSignedUrl(fileKey, FRESH_DOWNLOAD_URL_TTL_SECONDS, true);
          return { url };
        }
        logger.warn(
          `[BATCH EXPORT] Could not parse file key from stored URL for batch export ${batchExport.id}, falling back to stored URL`,
        );
      }

      // Fallback when the web container has no batch export bucket configured:
      // the stored URL, valid for as long as its signing credentials allow.
      return { url: batchExport.url };
    }),
  all: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "batchExports:read",
      });

      const [exports, totalCount] = await Promise.all([
        ctx.prisma.batchExport.findMany({
          where: {
            projectId: input.projectId,
          },
          take: input.limit,
          skip: input.page * input.limit,
          orderBy: {
            createdAt: "desc",
          },
        }),
        ctx.prisma.batchExport.count({
          where: {
            projectId: input.projectId,
          },
        }),
      ]);

      // Look up users for each export
      const userIds = [...new Set(exports.map((e) => e.userId))];
      const users = await ctx.prisma.user.findMany({
        where: {
          id: {
            in: userIds,
          },
          organizationMemberships: {
            some: {
              organization: {
                projects: {
                  some: {
                    id: input.projectId,
                  },
                },
              },
            },
          },
        },
        select: {
          id: true,
          name: true,
          image: true,
        },
      });

      const userMap = new Map(users.map((u) => [u.id, u]));

      const exportsWithExpiration = exports.map((e) => {
        const { url, ...rest } = e;

        return {
          ...rest,
          isExpired: isDownloadWindowExpired(e),
          isDownloadable:
            e.status === BatchExportStatus.COMPLETED &&
            Boolean(url) &&
            !isDownloadWindowExpired(e),
          user: userMap.get(e.userId) ?? null,
        };
      });

      return {
        exports: exportsWithExpiration,
        totalCount,
      };
    }),
});
