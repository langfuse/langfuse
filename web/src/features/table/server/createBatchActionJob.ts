import { auditLog } from "@/src/features/audit-logs/auditLog";
import { generateBatchActionId } from "@/src/features/table/server/helpers";
import {
  type BatchExportTableName,
  type BatchActionQuery,
  type ActionId,
  type BatchActionType,
} from "@langfuse/shared";
import {
  BatchActionQueue,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import type { ProjectAuthedContext } from "@/src/server/api/trpc";

type CreateBatchActionJob = {
  projectId: string;
  actionId: ActionId;
  tableName: BatchExportTableName;
  actionType: BatchActionType;
  trpcCtx: ProjectAuthedContext;
  query: BatchActionQuery;
  targetId?: string;
};

/**
 * ⚠️ Only use after verifying that the user has the necessary permissions to perform the action.
 */
export const createBatchActionJob = async ({
  projectId,
  actionId,
  tableName,
  actionType,
  trpcCtx,
  query,
  targetId,
}: CreateBatchActionJob) => {
  const batchActionId = generateBatchActionId(projectId, actionId, tableName);

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
    trpcCtx,
    resourceType: "batchAction",
    resourceId: batchActionId,
    action: actionType as string,
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
        tableName,
        cutoffCreatedAt: new Date(),
        query,
        targetId: targetId,
        type: actionType,
      },
    },
    {
      jobId: batchActionId,
    },
  );

  return;
};
