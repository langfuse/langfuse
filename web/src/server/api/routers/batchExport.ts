import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { WorkerClient } from "@/src/server/api/services/WorkerClient";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  BatchExportStatus,
  type EventBodyType,
  EventName,
  CreateBatchExportSchema,
} from "@langfuse/shared";
import { TRPCError } from "@trpc/server";

export const batchExportRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateBatchExportSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Check permissions, esp. projectId
        throwIfNoAccess({
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

        await new WorkerClient().sendEvent(event);

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
