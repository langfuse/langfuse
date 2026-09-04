import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  type ProjectAuthedContext,
} from "@/src/server/api/trpc";
import {
  BatchActionQueue,
  logger,
  QueueJobs,
  applyCommentFilters,
  getDeterministicSamplingValue,
  getObservationsCountFromEventsTable,
  getObservationsWithModelDataFromEventsTable,
  shouldSampleEvaluation,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import {
  BatchTableNames,
  BatchActionStatus,
  ActionId,
  BatchEvalSourceTable,
  getEvalTargetObjectFromSourceTable,
  InvalidRequestError,
} from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import {
  CreateObservationBatchEvaluationActionSchema,
  CreateObservationEvaluatorBackfillActionSchema,
} from "../validation";
import { batchEligibleEvaluatorWhere } from "@/src/features/evals/v2/server/evaluators/evaluatorRepository";
import { prepareBatchEvalEvaluatorMappings } from "./prepareBatchEvalEvaluatorMappings";

type CreateBatchEvaluationInput =
  | z.infer<typeof CreateObservationBatchEvaluationActionSchema>
  | z.infer<typeof CreateObservationEvaluatorBackfillActionSchema>;

async function createBatchEvaluation({
  input,
  ctx,
}: {
  input: CreateBatchEvaluationInput;
  ctx: ProjectAuthedContext;
}) {
  try {
    throwIfNoProjectAccess({
      session: ctx.session,
      projectId: input.projectId,
      scope: "evaluationRule:CUD",
    });

    const {
      projectId,
      query: requestedQuery,
      evaluatorIds: rawEvaluatorIds,
      sourceTable = BatchEvalSourceTable.EVENTS,
      evaluatorMappings: rawEvaluatorMappings,
    } = input;
    const backfillTimeRange =
      "backfillTimeRange" in input ? input.backfillTimeRange : undefined;
    const sampling = "sampling" in input ? input.sampling : undefined;
    const rowLimit = "rowLimit" in input ? input.rowLimit : undefined;
    const idempotencyKey =
      "idempotencyKey" in input ? input.idempotencyKey : undefined;
    const effectiveRowLimit =
      rowLimit === undefined
        ? undefined
        : Math.min(rowLimit, env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT);
    let query = requestedQuery;

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

    if (backfillTimeRange && sourceTable !== BatchEvalSourceTable.EVENTS) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Evaluator backfills only support observations.",
      });
    }

    if (idempotencyKey) {
      const existingBatchAction = await ctx.prisma.batchAction.findUnique({
        where: { id: idempotencyKey },
        select: { id: true, projectId: true, actionType: true },
      });
      if (existingBatchAction) {
        if (
          existingBatchAction.projectId !== projectId ||
          existingBatchAction.actionType !== ActionId.ObservationBatchEvaluation
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "The backfill request identifier is already in use.",
          });
        }
        return { id: existingBatchAction.id };
      }
    }

    const requestedEvaluatorIds = Array.from(new Set(rawEvaluatorIds));

    if (input.evalVersion === "v2" && ctx.session.user.v4BetaEnabled !== true) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Evaluator v2 is only available in fast preview.",
      });
    }

    const evaluatorIds = (
      input.evalVersion === "v2"
        ? await ctx.prisma.evaluator.findMany({
            where: {
              id: { in: requestedEvaluatorIds },
              projectId,
              ...batchEligibleEvaluatorWhere,
            },
            select: { id: true },
          })
        : await ctx.prisma.evaluationRule.findMany({
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
            ? input.evalVersion === "v2"
              ? `Evaluators [${missingEvaluatorIds.join(", ")}] are missing or incompatible with batch evaluation.`
              : `Evaluators [${missingEvaluatorIds.join(", ")}] are missing or not ${scopeLabel}-scoped.`
            : input.evalVersion === "v2"
              ? "Selected evaluators are missing or incompatible with batch evaluation."
              : `Selected evaluators are missing or not ${scopeLabel}-scoped.`,
      });
    }

    const evaluatorMappings =
      input.evalVersion === "v2" && rawEvaluatorMappings
        ? await prepareBatchEvalEvaluatorMappings({
            prisma: ctx.prisma,
            projectId,
            mappings: rawEvaluatorMappings,
          })
        : undefined;

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
      filter: [
        ...(commentFilterResult?.filterState ?? query.filter ?? []),
        ...(backfillTimeRange
          ? [
              {
                column: "startTime" as const,
                type: "datetime" as const,
                operator: ">=" as const,
                value: backfillTimeRange.from,
              },
              {
                column: "startTime" as const,
                type: "datetime" as const,
                operator: "<=" as const,
                value: backfillTimeRange.to,
              },
            ]
          : []),
      ],
      searchQuery: query.searchQuery,
      searchType: query.searchType,
    };

    const observationCount = commentFilterResult?.hasNoMatches
      ? 0
      : await getObservationsCountFromEventsTable(countQueryOpts);

    if (
      rowLimit === undefined &&
      observationCount > env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Too many observations selected. Maximum allowed is ${env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT}, but ${observationCount} observations match your filters. Please refine your filters to reduce the count.`,
      });
    }

    if (
      backfillTimeRange &&
      sampling !== undefined &&
      effectiveRowLimit !== undefined
    ) {
      const candidates = commentFilterResult?.hasNoMatches
        ? []
        : await getObservationsWithModelDataFromEventsTable({
            ...countQueryOpts,
            orderBy: { column: "startTime", order: "DESC" },
            limit: effectiveRowLimit,
            offset: 0,
            selectIOAndMetadata: false,
            dedupeBySpanId: true,
          });
      const selectedIds = candidates
        .filter((observation) =>
          shouldSampleEvaluation({
            samplingValue: getDeterministicSamplingValue(observation.id),
            samplingRate: sampling,
          }),
        )
        .map(({ id }) => id);
      query = {
        filter: [
          {
            column: "id",
            type: "stringOptions",
            operator: "any of",
            value: selectedIds,
          },
        ],
        orderBy: { column: "startTime", order: "DESC" },
        useEventsTable: true,
      };

      if (selectedIds.length === 0) {
        return { id: null };
      }
    }

    const userId = ctx.session.user.id;
    const batchConfig = {
      evaluatorIds,
      ...(input.evalVersion ? { evalVersion: input.evalVersion } : {}),
      ...(evaluatorMappings ? { evaluatorMappings } : {}),
    };

    logger.info("[TRPC] Creating observation-run-batched-evaluation action", {
      projectId,
      evaluatorCount: evaluatorIds.length,
      evaluatorIds,
    });

    const batchAction = await ctx.prisma.batchAction.create({
      data: {
        ...(idempotencyKey ? { id: idempotencyKey } : {}),
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
          ...(batchConfig.evalVersion
            ? { evalVersion: batchConfig.evalVersion }
            : {}),
          ...(evaluatorMappings ? { evaluatorMappings } : {}),
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
}

export const runEvaluationRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateObservationBatchEvaluationActionSchema)
    .mutation(createBatchEvaluation),
  createBackfill: protectedProjectProcedure
    .input(CreateObservationEvaluatorBackfillActionSchema)
    .mutation(createBatchEvaluation),
});
