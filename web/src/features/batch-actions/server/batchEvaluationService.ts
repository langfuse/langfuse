/* eslint-disable no-nested-ternary */
import type { z } from "zod";
import {
  ActionId,
  BatchActionStatus,
  BatchEvalSourceTable,
  BatchTableNames,
  getEvalTargetObjectFromSourceTable,
  InvalidRequestError,
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
import { batchEligibleEvaluatorWhere } from "@/src/features/evals/v2/server/evaluators/evaluatorRepository";
import type { CreateObservationBatchEvaluationActionSchema } from "../validation";
import { prepareBatchEvalEvaluatorMappings } from "./prepareBatchEvalEvaluatorMappings";

type ParsedBatchEvaluationInput = z.output<
  typeof CreateObservationBatchEvaluationActionSchema
>;

export type CreateBatchEvaluationInput = Omit<
  ParsedBatchEvaluationInput,
  "sourceTable"
> &
  Partial<Pick<ParsedBatchEvaluationInput, "sourceTable">>;

export type BatchEvaluationAuditEvent = {
  batchAction: BatchAction;
};

/**
 * Queues a batch evaluation over the observations matching a table query.
 * Callers authorize the actor (project RBAC, rollout gates) before calling.
 */
export class BatchEvaluationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: (event: BatchEvaluationAuditEvent) => Promise<void>,
  ) {}

  async create(
    input: CreateBatchEvaluationInput,
    actor: { userId: string },
  ): Promise<{ id: string }> {
    const {
      projectId,
      query,
      evaluatorIds: rawEvaluatorIds,
      sourceTable = BatchEvalSourceTable.EVENTS,
      evaluatorMappings: rawEvaluatorMappings,
      sampling,
      rowLimit,
    } = input;

    if (env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN !== "true") {
      throw new InvalidRequestError(
        "Events table is not enabled for this instance.",
      );
    }

    const targetObject = getEvalTargetObjectFromSourceTable(sourceTable);
    const scopeLabel =
      sourceTable === BatchEvalSourceTable.EVENTS
        ? "observation"
        : "experiment";

    const requestedEvaluatorIds = Array.from(new Set(rawEvaluatorIds));

    const evaluatorIds = (
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

      throw new InvalidRequestError(
        missingEvaluatorIds.length > 0
          ? input.evalVersion === "v2"
            ? `Evaluators [${missingEvaluatorIds.join(", ")}] are missing or incompatible with batch evaluation.`
            : `Evaluators [${missingEvaluatorIds.join(", ")}] are missing or not ${scopeLabel}-scoped.`
          : input.evalVersion === "v2"
            ? "Selected evaluators are missing or incompatible with batch evaluation."
            : `Selected evaluators are missing or not ${scopeLabel}-scoped.`,
      );
    }

    const evaluatorMappings =
      input.evalVersion === "v2" && rawEvaluatorMappings
        ? await prepareBatchEvalEvaluatorMappings({
            prisma: this.prisma,
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
            prisma: this.prisma,
            projectId,
            objectType: "OBSERVATION",
          })
        : null;

    const observationCount = commentFilterResult?.hasNoMatches
      ? 0
      : await getObservationsCountFromEventsTable({
          projectId,
          filter: commentFilterResult?.filterState ?? query.filter ?? [],
          searchQuery: query.searchQuery,
          searchType: query.searchType,
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

    await this.audit({ batchAction });

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
          ...(sampling !== undefined ? { sampling } : {}),
          ...(rowLimit !== undefined ? { rowLimit } : {}),
        },
      },
      {
        jobId: batchAction.id,
      },
    );

    return { id: batchAction.id };
  }
}
