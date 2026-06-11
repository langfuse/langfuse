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
import { assertLegacyTracingIoSearchCanCreateBatchJob } from "@/src/features/traces/server/legacyIoSearch";

type CreateBatchActionJob = {
  projectId: string;
  actionId: Exclude<
    ActionId,
    | "observation-add-to-dataset"
    | "observation-run-batched-evaluation"
    | "experiment-compare"
  >;
  tableName: BatchExportTableName;
  actionType: BatchActionType;
  session: {
    user: {
      id: string;
      v4BetaEnabled?: boolean | null;
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
  assertLegacyTracingIoSearchCanCreateBatchJob({
    searchQuery: query.searchQuery,
    searchType: query.searchType,
    tableName,
  });

  // Snapshot the user's v4 beta flag into the persisted query so the worker
  // resolves the selection from the same data source as the UI table the user
  // selected from, never the live user record. Overrides any client-sent value.
  const queryWithSnapshot: BatchActionQuery = {
    ...query,
    useEventsTable: session.user.v4BetaEnabled ?? false,
  };

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
        query: queryWithSnapshot,
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
