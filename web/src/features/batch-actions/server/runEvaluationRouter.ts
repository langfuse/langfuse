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
  applyCommentFilters,
  getObservationsCountFromEventsTable,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import {
  BatchTableNames,
  BatchActionStatus,
  ActionId,
  BatchEvalSourceTable,
  getEvalTargetObjectFromSourceTable,
  InvalidRequestError,
} from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import { CreateObservationBatchEvaluationActionSchema } from "../validation";

export const runEvaluationRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateObservationBatchEvaluationActionSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "evalJob:CUD",
        });

        const {
          projectId,
          query,
          evaluatorIds: rawEvaluatorIds,
          sourceTable = BatchEvalSourceTable.EVENTS,
        } = input;

        if (env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN !== "true") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Events table is not enabled for this instance.",
          });
        }

        // Derive targetObject from sourceTable
        const targetObject = getEvalTargetObjectFromSourceTable(sourceTable);
        const scopeLabel =
          sourceTable === BatchEvalSourceTable.EVENTS
            ? "observation"
            : "experiment";

        const requestedEvaluatorIds = Array.from(new Set(rawEvaluatorIds));

        const evaluatorIds = (
          await ctx.prisma.jobConfiguration.findMany({
            where: {
              id: {
                in: requestedEvaluatorIds,
              },
              projectId,
              targetObject,
            },
            select: {
              id: true,
            },
          })
        ).map((e) => e.id);

        if (evaluatorIds.length !== requestedEvaluatorIds.length) {
          const foundIds = new Set(evaluatorIds);
          const missingEvaluatorIds = requestedEvaluatorIds.filter(
            (id) => !foundIds.has(id),
          );

          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              missingEvaluatorIds.length > 0
                ? `Evaluators [${missingEvaluatorIds.join(", ")}] are missing or not ${scopeLabel}-scoped.`
                : `Selected evaluators are missing or not ${scopeLabel}-scoped.`,
          });
        }

        // Event comments live in Postgres, so resolve them for the preflight
        // count while retaining the original query for the queued worker.
        const commentFilterResult =
          sourceTable === BatchEvalSourceTable.EVENTS
            ? await applyCommentFilters({
                filterState: query.filter ?? [],
                prisma: ctx.prisma,
                projectId,
                objectType: "OBSERVATION",
              })
            : null;

        const countQueryOpts = {
          projectId,
          filter: commentFilterResult?.filterState ?? query.filter ?? [],
          searchQuery: query.searchQuery,
          searchType: query.searchType,
        };

        const observationCount = commentFilterResult?.hasNoMatches
          ? 0
          : await getObservationsCountFromEventsTable(countQueryOpts);

        if (observationCount > env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Too many observations selected. Maximum allowed is ${env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT}, but ${observationCount} observations match your filters. Please refine your filters to reduce the count.`,
          });
        }

        const userId = ctx.session.user.id;
        const batchConfig = { evaluatorIds };

        logger.info(
          "[TRPC] Creating observation-run-batched-evaluation action",
          {
            projectId,
            evaluatorCount: evaluatorIds.length,
            evaluatorIds,
          },
        );

        const batchAction = await ctx.prisma.batchAction.create({
          data: {
            projectId,
            userId,
            actionType: ActionId.ObservationBatchEvaluation,
            tableName: BatchTableNames.Events,
            status: BatchActionStatus.Queued,
            query,
            config: batchConfig,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "batchAction",
          resourceId: batchAction.id,
          projectId,
          action: ActionId.ObservationBatchEvaluation,
          after: batchAction,
        });

        await BatchActionQueue.getInstance()?.add(
          QueueJobs.BatchActionProcessingJob,
          {
            id: batchAction.id,
            name: QueueJobs.BatchActionProcessingJob,
            timestamp: new Date(),
            payload: {
              actionId: ActionId.ObservationBatchEvaluation,
              batchActionId: batchAction.id,
              projectId,
              cutoffCreatedAt: new Date(),
              query,
              evaluatorIds: batchConfig.evaluatorIds,
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
        if (e instanceof InvalidRequestError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: e.message,
            cause: e,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Creating run-evaluation action failed.",
        });
      }
    }),
});
