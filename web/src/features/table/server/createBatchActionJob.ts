import { auditLog } from "@/src/features/audit-logs/auditLog";
import { generateBatchActionId } from "@/src/features/table/server/helpers";
import {
  type Role,
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

type CreateBatchActionJob = {
  projectId: string;
  actionId: Exclude<
    ActionId,
    "observation-add-to-dataset" | "observation-run-evaluation"
  >;
  tableName: BatchExportTableName;
  actionType: BatchActionType;
  session: {
    user: {
      id: string;
    };
    orgId: string;
    orgRole: Role;
    projectId?: string;
    projectRole?: Role;
  };
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
  session,
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
    session,
    resourceType: "batchAction",
    resourceId: batchActionId,
    projectId: projectId,
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
