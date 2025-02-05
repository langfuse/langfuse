import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { getServerActionConfig } from "@/src/features/table/server/helpers";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  CreateBulkActionSchema,
  GetIsBulkActionInProgressSchema,
  InvalidRequestError,
  type BulkActionTableName,
} from "@langfuse/shared";
import { SelectAllQueue, logger, QueueJobs } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

const WAITING_JOBS = ["waiting", "delayed", "active"];

const getWaitingJobsByProjectId = async (
  projectId: string,
  tableName: BulkActionTableName,
) => {
  const selectAllQueue = SelectAllQueue.getInstance();

  if (!selectAllQueue) {
    logger.warn(`SelectAllQueue not initialized`);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Select All action failed to process.",
    });
  }
  if (!redis) {
    return [];
  }
  const jobIds = await redis.smembers(`projectJobs:${projectId}:${tableName}`);
  const jobs = await Promise.all(
    jobIds.map((id) => selectAllQueue.getJobState(id)),
  );
  return jobs.filter((job) => job !== null && WAITING_JOBS.includes(job));
};

const generateBulkSelectId = (
  projectId: string,
  actionId: string,
  tableName: string,
) => {
  return `${projectId}-${tableName}-${actionId}`;
};

export const tableRouter = createTRPCRouter({
  selectAll: protectedProjectProcedure
    .input(CreateBulkActionSchema)
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
        const bulkSelectId = generateBulkSelectId(
          projectId,
          actionId,
          tableName,
        );

        const selectAllQueue = SelectAllQueue.getInstance();

        if (!selectAllQueue) {
          logger.warn(`SelectAllQueue not initialized`);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Select All action failed to process.",
          });
        }

        // Create audit log >> generate based on actionId
        await auditLog({
          session: ctx.session,
          resourceType,
          resourceId: bulkSelectId,
          projectId,
          action: type,
        });

        // Notify worker
        await selectAllQueue
          .add(QueueJobs.SelectAllProcessingJob, {
            id: bulkSelectId, // Use the selectAllId to deduplicate when the same job is sent multiple times
            name: QueueJobs.SelectAllProcessingJob,
            timestamp: new Date(),
            payload: {
              projectId,
              actionId,
              query: JSON.stringify(query),
              tableName,
              cutoffCreatedAt: new Date(),
              targetId,
            },
          })
          .then((job) => {
            if (redis && job.id) {
              redis.sadd(`projectJobs:${projectId}:${tableName}`, job.id); // Store job ID under project-specific key
            }
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
  getIsSelectAllInProgress: protectedProjectProcedure
    .input(GetIsBulkActionInProgressSchema)
    .query(async ({ input }) => {
      const { projectId, tableName } = input;

      const selectAllQueue = SelectAllQueue.getInstance();

      if (!selectAllQueue) {
        logger.warn(`SelectAllQueue not initialized`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Select All action failed to process.",
        });
      }

      const jobs = await getWaitingJobsByProjectId(projectId, tableName);
      const isInProgress = jobs.length > 0;

      return isInProgress;
    }),
});
