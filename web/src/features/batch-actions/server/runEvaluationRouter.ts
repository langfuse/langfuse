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
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import {
  BatchTableNames,
  BatchActionType,
  BatchActionStatus,
  ActionId,
  EvalTargetObject,
} from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import { CreateObservationRunEvaluationActionSchema } from "../validation";

export const runEvaluationRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateObservationRunEvaluationActionSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "evalJob:CUD",
        });

        const { projectId, query, config } = input;

        if (
          env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS !== "true" ||
          env.LANGFUSE_ENABLE_EVENTS_TABLE_FLAGS !== "true"
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Events table is not enabled for this instance. Historical event evaluations require LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS=true and LANGFUSE_ENABLE_EVENTS_TABLE_FLAGS=true.",
          });
        }

        const requestedEvaluatorIds = Array.from(
          new Set(
            config.evaluators.map((evaluator) => evaluator.evaluatorConfigId),
          ),
        );

        const evaluators = await ctx.prisma.jobConfiguration.findMany({
          where: {
            id: {
              in: requestedEvaluatorIds,
            },
            projectId,
            targetObject: EvalTargetObject.EVENT,
            status: "ACTIVE",
          },
          select: {
            id: true,
            scoreName: true,
          },
        });

        if (evaluators.length !== requestedEvaluatorIds.length) {
          const foundIds = new Set(evaluators.map((evaluator) => evaluator.id));
          const missingEvaluatorIds = requestedEvaluatorIds.filter(
            (id) => !foundIds.has(id),
          );

          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              missingEvaluatorIds.length > 0
                ? `Evaluators [${missingEvaluatorIds.join(", ")}] are missing, inactive, or not event-scoped.`
                : "Selected evaluators are missing, inactive, or not event-scoped.",
          });
        }

        const selectedEvaluators = evaluators.map((evaluator) => ({
          evaluatorConfigId: evaluator.id,
          evaluatorName: evaluator.scoreName,
        }));

        const queryOpts = {
          projectId,
          filter: query.filter ?? [],
          searchQuery: query.searchQuery,
          searchType: query.searchType,
          limit: 1,
          offset: 0,
        };
        const observationCount =
          await getObservationsCountFromEventsTable(queryOpts);

        if (observationCount > env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Too many observations selected. Maximum allowed is ${env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT}, but ${observationCount} observations match your filters. Please refine your filters to reduce the count.`,
          });
        }

        const userId = ctx.session.user.id;
        const batchConfig = {
          evaluators: selectedEvaluators,
        };

        logger.info("[TRPC] Creating observation-run-evaluation action", {
          projectId,
          evaluatorCount: selectedEvaluators.length,
          evaluatorIds: selectedEvaluators.map(
            (evaluator) => evaluator.evaluatorConfigId,
          ),
        });

        const batchAction = await ctx.prisma.batchAction.create({
          data: {
            projectId,
            userId,
            actionType: ActionId.ObservationRunEvaluation,
            tableName: BatchTableNames.Observations,
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
          action: "create",
          after: batchAction,
        });

        await BatchActionQueue.getInstance()?.add(
          QueueJobs.BatchActionProcessingJob,
          {
            id: batchAction.id,
            name: QueueJobs.BatchActionProcessingJob,
            timestamp: new Date(),
            payload: {
              batchActionId: batchAction.id,
              projectId,
              actionId: ActionId.ObservationRunEvaluation,
              tableName: BatchTableNames.Observations,
              cutoffCreatedAt: new Date(),
              query,
              config: batchConfig,
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
          message: "Creating run-evaluation action failed.",
        });
      }
    }),
});
