import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  BatchActionQueue,
  logger,
  QueueJobs,
  getObservationsCountFromEventsTable,
  getObservationsTableCount,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import {
  BatchTableNames,
  BatchActionType,
  BatchActionStatus,
  ActionId,
} from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import { CreateObservationAddToDatasetActionSchema } from "../validation";

const MAX_BATCH_ADD_TO_DATASET_ITEMS = 1000;

export const addToDatasetRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateObservationAddToDatasetActionSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Check permissions
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "datasets:CUD",
        });

        const { projectId, query, config } = input;

        const useEventsTable =
          env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true";
        const tableName = useEventsTable
          ? BatchTableNames.Events
          : BatchTableNames.Observations;

        // Check observation count doesn't exceed maximum
        const queryOpts = {
          projectId,
          filter: query.filter ?? [],
          limit: 1,
          offset: 0,
        };
        const observationCount = useEventsTable
          ? await getObservationsCountFromEventsTable(queryOpts)
          : await getObservationsTableCount(queryOpts);

        if (observationCount > MAX_BATCH_ADD_TO_DATASET_ITEMS) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Too many observations selected. Maximum allowed is ${MAX_BATCH_ADD_TO_DATASET_ITEMS}, but ${observationCount} observations match your filters. Please refine your filters to reduce the count.`,
          });
        }
        const userId = ctx.session.user.id;

        logger.info("[TRPC] Creating observation-add-to-dataset action", {
          projectId,
        });

        // Create table batch action record
        const batchAction = await ctx.prisma.batchAction.create({
          data: {
            projectId,
            userId,
            actionType: ActionId.ObservationAddToDataset,
            tableName,
            status: BatchActionStatus.Queued,
            query,
            config,
          },
        });

        // Create audit log
        await auditLog({
          session: ctx.session,
          resourceType: "batchAction",
          resourceId: batchAction.id,
          projectId,
          action: "create",
          after: batchAction,
        });

        // Queue the job
        await BatchActionQueue.getInstance()?.add(
          QueueJobs.BatchActionProcessingJob,
          {
            id: batchAction.id,
            name: QueueJobs.BatchActionProcessingJob,
            timestamp: new Date(),
            payload: {
              batchActionId: batchAction.id,
              projectId,
              actionId: ActionId.ObservationAddToDataset,
              tableName,
              cutoffCreatedAt: new Date(),
              query,
              config,
              type: BatchActionType.Create,
            },
          },
          {
            jobId: batchAction.id,
          },
        );

        return { id: batchAction.id };
      } catch (e) {
        logger.error(e);
        if (e instanceof TRPCError) {
          throw e;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Creating add-to-dataset action failed.",
        });
      }
    }),
});
