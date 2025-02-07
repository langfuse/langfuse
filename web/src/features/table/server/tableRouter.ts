import { generateBatchActionId } from "./helpers";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { GetIsBatchActionInProgressSchema } from "@langfuse/shared";
import { BatchActionQueue, logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

const WAITING_JOBS = ["waiting", "delayed", "active"];

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
