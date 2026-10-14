import { generateBatchActionId } from "./helpers";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  ActionId,
  BatchActionStatus,
  GetIsBatchActionInProgressSchema,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { BatchActionQueue, logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

const WAITING_JOBS = ["waiting", "delayed", "active"];
const ACTIVE_BATCH_ACTION_STATUSES = [
  BatchActionStatus.Queued,
  BatchActionStatus.Processing,
];

export const tableRouter = createTRPCRouter({
  getIsBatchActionInProgress: protectedProjectProcedure
    .input(GetIsBatchActionInProgressSchema)
    .query(async ({ input }) => {
      const { projectId, tableName, actionId } = input;
      const batchActionId = generateBatchActionId(
        projectId,
        actionId,
        tableName,
      );
      const batchAction = await prisma.batchAction.findUnique({
        where: { id: batchActionId },
        select: { status: true },
      });

      if (
        batchAction &&
        ACTIVE_BATCH_ACTION_STATUSES.includes(
          batchAction.status as BatchActionStatus,
        )
      ) {
        return true;
      }

      const batchActionQueue = BatchActionQueue.getInstance();

      if (!batchActionQueue) {
        if (actionId === ActionId.TraceDelete) {
          return false;
        }

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
