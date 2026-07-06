import { auditLog } from "@/src/features/audit-logs/auditLog";
import { generateBatchActionId } from "@/src/features/table/server/helpers";
import {
  ActionId,
  BatchActionStatus,
  type Role,
  type BatchExportTableName,
  type BatchActionQuery,
  type BatchActionType,
  createTraceDeleteBatchActionConfig,
} from "@langfuse/shared";
import {
  BatchActionQueue,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { assertLegacyTracingIoSearchCanCreateBatchJob } from "@/src/features/traces/server/legacyIoSearch";
import { prisma } from "@langfuse/shared/src/db";

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

const ACTIVE_BATCH_ACTION_STATUSES = [
  BatchActionStatus.Queued,
  BatchActionStatus.Processing,
];

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

  // Snapshot the user's v4 beta flag so the worker reads from the same data
  // source as the UI table; overrides any client-sent value.
  const queryWithSnapshot: BatchActionQuery = {
    ...query,
    useEventsTable: session.user.v4BetaEnabled ?? false,
  };

  const batchActionId = generateBatchActionId(projectId, actionId, tableName);

  if (actionId === ActionId.TraceDelete) {
    const cutoffCreatedAt = new Date();
    const config = createTraceDeleteBatchActionConfig({
      useEventsTable: queryWithSnapshot.useEventsTable ?? false,
      cutoffCreatedAt,
    });
    const batchActionData = {
      userId: session.user.id,
      actionType: actionId,
      tableName,
      status: BatchActionStatus.Queued,
      query: queryWithSnapshot,
      config,
      totalCount: null,
      processedCount: 0,
      failedCount: 0,
    };

    const activeTraceDeleteConflict = new TRPCError({
      code: "CONFLICT",
      message:
        "A trace deletion batch action is already in progress for this project.",
    });

    await prisma.$transaction(async (tx) => {
      const created = await tx.batchAction.createMany({
        data: {
          id: batchActionId,
          projectId,
          ...batchActionData,
        },
        skipDuplicates: true,
      });

      if (created.count > 0) {
        return;
      }

      const reset = await tx.batchAction.updateMany({
        where: {
          id: batchActionId,
          status: { notIn: ACTIVE_BATCH_ACTION_STATUSES },
        },
        data: {
          finishedAt: null,
          log: null,
          ...batchActionData,
        },
      });

      if (reset.count === 0) {
        throw activeTraceDeleteConflict;
      }
    });

    await auditLog({
      session,
      resourceType: "batchAction",
      resourceId: batchActionId,
      projectId: projectId,
      action: actionType as string,
    });

    return;
  }

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
