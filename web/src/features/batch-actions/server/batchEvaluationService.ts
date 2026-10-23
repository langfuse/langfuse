import type { z } from "zod";
import {
  ActionId,
  BatchActionStatus,
  BatchEvalSourceTable,
  BatchTableNames,
  getEvalTargetObjectFromSourceTable,
  InvalidRequestError,
  type BatchActionQuery,
  type Plan,
} from "@langfuse/shared";
import type { BatchAction, PrismaClient } from "@langfuse/shared/src/db";
import {
  BatchActionQueue,
  QueueJobs,
  applyCommentFilters,
  getObservationsCountFromEventsTable,
  logger,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { clampToDataAccessDays } from "@/src/features/entitlements/server";
import { batchEligibleEvaluatorWhere } from "@/src/features/evals/v2/server/evaluators/evaluatorRepository";
import type { CreateObservationBatchEvaluationActionSchema } from "../validation";
import { prepareBatchEvalEvaluatorMappings } from "./prepareBatchEvalEvaluatorMappings";

type CreateBatchEvaluationInput = z.output<
  typeof CreateObservationBatchEvaluationActionSchema
>;

function withDataAccessFloor(
  query: BatchActionQuery,
  plan: Plan | null,
): BatchActionQuery {
  const { accessFloor } = clampToDataAccessDays({ plan });
  if (!accessFloor) return query;

  return {
    ...query,
    filter: [
      ...(query.filter ?? []),
      {
        type: "datetime",
        column: "startTime",
        operator: ">=",
        value: accessFloor,
      },
    ],
  };
}

function missingEvaluatorsMessage(params: {
  missingEvaluatorIds: string[];
  isEvaluatorV2: boolean;
  sourceTable: BatchEvalSourceTable;
}): string {
  const { missingEvaluatorIds, isEvaluatorV2, sourceTable } = params;
  const subject =
    missingEvaluatorIds.length > 0
      ? `Evaluators [${missingEvaluatorIds.join(", ")}]`
      : "Selected evaluators";

  if (isEvaluatorV2) {
    return `${subject} are missing or incompatible with batch evaluation.`;
  }

  const scopeLabel =
    sourceTable === BatchEvalSourceTable.EVENTS ? "observation" : "experiment";
  return `${subject} are missing or not ${scopeLabel}-scoped.`;
}

/**
 * Queues a batch evaluation over the observations matching a table query.
 * Callers authorize the actor (project RBAC, rollout gates) before calling.
 */
export class BatchEvaluationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: (batchAction: BatchAction) => Promise<void>,
  ) {}

  async create(
    input: CreateBatchEvaluationInput,
    /** `plan` limits the selection to the organization's data-access window. */
    actor: { userId: string; plan: Plan | null },
  ): Promise<{ id: string }> {
    const {
      projectId,
      sourceTable,
      evaluatorMappings: rawEvaluatorMappings,
      sampling,
      rowLimit,
    } = input;

    if (env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN !== "true") {
      throw new InvalidRequestError(
        "Events table is not enabled for this instance.",
      );
    }

    const query = withDataAccessFloor(input.query, actor.plan);
    const evaluatorIds = await this.findEvaluatorIds(input, sourceTable);

    const evaluatorMappings =
      input.evalVersion === "v2" && rawEvaluatorMappings
        ? await prepareBatchEvalEvaluatorMappings({
            prisma: this.prisma,
            projectId,
            mappings: rawEvaluatorMappings,
          })
        : undefined;

    const observationCount = await this.countMatchingObservations({
      projectId,
      query,
      sourceTable,
    });
    if (
      rowLimit === undefined &&
      observationCount > env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT
    ) {
      throw new InvalidRequestError(
        `Too many observations selected. Maximum allowed is ${env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT}, but ${observationCount} observations match your filters. Please refine your filters to reduce the count.`,
      );
    }

    const batchConfig = {
      evaluatorIds,
      ...(input.evalVersion ? { evalVersion: input.evalVersion } : {}),
      ...(evaluatorMappings ? { evaluatorMappings } : {}),
      ...(sampling !== undefined ? { sampling } : {}),
      ...(rowLimit !== undefined ? { rowLimit } : {}),
    };

    logger.info("Creating observation-run-batched-evaluation action", {
      projectId,
      evaluatorCount: evaluatorIds.length,
      evaluatorIds,
    });

    const batchAction = await this.prisma.batchAction.create({
      data: {
        projectId,
        userId: actor.userId,
        actionType: ActionId.ObservationBatchEvaluation,
        tableName: BatchTableNames.Events,
        status: BatchActionStatus.Queued,
        query,
        config: batchConfig,
      },
    });

    await this.audit(batchAction);

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
          ...batchConfig,
        },
      },
      {
        jobId: batchAction.id,
      },
    );

    return { id: batchAction.id };
  }

  private async findEvaluatorIds(
    input: CreateBatchEvaluationInput,
    sourceTable: BatchEvalSourceTable,
  ): Promise<string[]> {
    const { projectId } = input;
    const requestedEvaluatorIds = Array.from(new Set(input.evaluatorIds));

    const found =
      input.evalVersion === "v2"
        ? await this.prisma.evaluator.findMany({
            where: {
              id: { in: requestedEvaluatorIds },
              projectId,
              ...batchEligibleEvaluatorWhere,
            },
            select: { id: true },
          })
        : await this.prisma.evaluationRule.findMany({
            where: {
              id: { in: requestedEvaluatorIds },
              projectId,
              targetObject: getEvalTargetObjectFromSourceTable(sourceTable),
            },
            select: { id: true },
          });
    const evaluatorIds = found.map((e) => e.id);

    if (evaluatorIds.length !== requestedEvaluatorIds.length) {
      const foundIds = new Set(evaluatorIds);
      throw new InvalidRequestError(
        missingEvaluatorsMessage({
          missingEvaluatorIds: requestedEvaluatorIds.filter(
            (id) => !foundIds.has(id),
          ),
          isEvaluatorV2: input.evalVersion === "v2",
          sourceTable,
        }),
      );
    }

    return evaluatorIds;
  }

  private async countMatchingObservations(params: {
    projectId: string;
    query: BatchActionQuery;
    sourceTable: BatchEvalSourceTable;
  }): Promise<number> {
    const { projectId, query, sourceTable } = params;

    // Event comments live in Postgres, so resolve them for the preflight
    // count while retaining the original query for the queued worker.
    const commentFilterResult =
      sourceTable === BatchEvalSourceTable.EVENTS
        ? await applyCommentFilters({
            filterState: query.filter ?? [],
            prisma: this.prisma,
            projectId,
            objectType: "OBSERVATION",
          })
        : null;

    if (commentFilterResult?.hasNoMatches) return 0;

    return getObservationsCountFromEventsTable({
      projectId,
      filter: commentFilterResult?.filterState ?? query.filter ?? [],
      searchQuery: query.searchQuery,
      searchType: query.searchType,
    });
  }
}
