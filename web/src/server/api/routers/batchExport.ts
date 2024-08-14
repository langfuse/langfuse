import { env } from "@/src/env.mjs";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { WorkerClient } from "@/src/server/api/services/WorkerClient";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { BatchExportStatus, CreateBatchExportSchema } from "@langfuse/shared";
import {
  getBatchExportQueue,
  type EventBodyType,
  EventName,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { redis } from "@langfuse/shared/src/server";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";

export const batchExportRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateBatchExportSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoEntitlement({
          entitlement: "batch-export",
          sessionUser: ctx.session.user,
          projectId: input.projectId,
        });
        // Check permissions, esp. projectId
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "batchExport:create",
        });

        const { projectId, query, format, name } = input;
        console.log(
          "[TRPC] Creating export job",
          JSON.stringify(input, null, 2),
        );
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
        const event: EventBodyType = {
          name: EventName.BatchExport,
          payload: {
            batchExportId: exportJob.id,
            projectId,
          },
        };

        if (redis && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
          await getBatchExportQueue()?.add(event.name, {
            id: event.payload.batchExportId, // Use the batchExportId to deduplicate when the same job is sent multiple times
            name: QueueJobs.BatchExportJob,
            timestamp: new Date(),
            payload: event.payload,
          });
        } else {
          await new WorkerClient().sendEvent(event);
        }
        return;
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Creating export job failed.",
        });
      }
    }),
});
