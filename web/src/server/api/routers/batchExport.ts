import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { BatchExportStatus, CreateBatchExportSchema } from "@langfuse/shared";
import {
  BatchExportQueue,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

export const batchExportRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateBatchExportSchema)
    .mutation(async ({ input, ctx }) => {
      try {
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
        logger.error(e);
        if (e instanceof TRPCError) {
          throw e;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Creating export job failed.",
        });
      }
    }),
});
