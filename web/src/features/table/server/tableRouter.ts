import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { getServerActionConfig } from "@/src/features/table/server/helpers";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  CreateBatchActionSchema,
  GetIsBatchActionInProgressSchema,
  InvalidRequestError,
} from "@langfuse/shared";
import {
  BatchActionQueue,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

const WAITING_JOBS = ["waiting", "delayed", "active"];

const generateBatchActionId = (
  projectId: string,
  actionId: string,
  tableName: string,
) => {
  return `${projectId}-${tableName}-${actionId}`;
};

export const tableRouter = createTRPCRouter({
  selectAll: protectedProjectProcedure
    .input(CreateBatchActionSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const { scope, entitlement, resourceType, type } =
          getServerActionConfig(input.actionId, input.tableName);

        if (type == "create" && !input.targetId) {
          throw new InvalidRequestError(
            `Target ID is required for create action`,
          );
        }

        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope,
        });

        if (!!entitlement) {
          throwIfNoEntitlement({
            entitlement,
            projectId: input.projectId,
            sessionUser: ctx.session.user,
          });
        }

        const { projectId, actionId, query, tableName, targetId } = input;
        const batchActionId = generateBatchActionId(
          projectId,
          actionId,
          tableName,
        );

        const batchActionQueue = BatchActionQueue.getInstance();

        if (!batchActionQueue) {
          logger.warn(`BatchActionQueue not initialized`);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Select All action failed to process.",
          });
        }

        // Create audit log >> generate based on actionId
        await auditLog({
          session: ctx.session,
          resourceType,
          resourceId: batchActionId,
          projectId,
          action: type,
        });

        // Notify worker
        await batchActionQueue.add(
          QueueJobs.BatchActionProcessingJob,
          {
            id: batchActionId, // Use the selectAllId to deduplicate when the same job is sent multiple times
            name: QueueJobs.BatchActionProcessingJob,
            timestamp: new Date(),
            payload: {
              projectId,
              actionId,
              query: JSON.stringify(query),
              tableName,
              cutoffCreatedAt: new Date(),
              targetId,
            },
          },
          {
            jobId: batchActionId,
          },
        );
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
  getIsSelectAllInProgress: protectedProjectProcedure
    .input(GetIsBatchActionInProgressSchema)
    .query(async ({ input }) => {
      const { projectId, tableName, actionId } = input;
      const batchActionId = generateBatchActionId(
        projectId,
        input.actionId,
        input.tableName,
      );

      const batchActionQueue = BatchActionQueue.getInstance();

      if (!batchActionQueue) {
        logger.warn(`BatchActionQueue not initialized`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Bulk Action action failed to process.",
        });
      }

      const jobState = await batchActionQueue.getJobState(batchActionId);
      const isInProgress = WAITING_JOBS.includes(jobState);

      return isInProgress;
    }),
});
