import {
  BatchActionProcessingEventType,
  CreateEvalQueue,
  getEventsStreamForEval,
  getCurrentSpan,
  logger,
  QueueJobs,
  QueueName,
  TQueueJobTypes,
  findDatasetIdsForBatchDeletion,
  traceDeletionProcessor,
  applyCommentFilters,
} from "@langfuse/shared/src/server";
import {
  BatchActionType,
  BatchActionStatus,
  BatchTableNames,
  FilterCondition,
  EvalTargetObject,
  EvalTemplateType,
  JobConfigState,
  normalizeEvaluationRuleTarget,
} from "@langfuse/shared";
import Decimal from "decimal.js";
import {
  getDatabaseReadStreamPaginated,
  getTraceIdentifierStream,
} from "../database-read-stream/getDatabaseReadStream";
import { env } from "../../env";
import { Job, Queue } from "bullmq";
import {
  processAddObservationsToQueue,
  processAddSessionsToQueue,
  processAddTracesToQueue,
} from "./processAddToQueue";
import { prisma } from "@langfuse/shared/src/db";
import { randomUUID } from "node:crypto";
import { processClickhouseScoreDelete } from "../scores/processClickhouseScoreDelete";
import { getObservationStream } from "../database-read-stream/observation-stream";
import {
  getEventsStreamForDataset,
  getEventsStreamForAnnotationQueue,
} from "../database-read-stream/event-stream";
import { processAddObservationsToDataset } from "./processAddObservationsToDataset";
import { ObservationAddToDatasetConfigSchema } from "@langfuse/shared";
import { processBatchedObservationEval } from "./processBatchedObservationEval";
import { processDeleteDatasets } from "./processDeleteDatasets";

const CHUNK_SIZE = 1000;
const convertDatesInFiltersFromStrings = (filters: FilterCondition[]) => {
  return filters.map((f: FilterCondition) =>
    f.type === "datetime" ? { ...f, value: new Date(f.value) } : f,
  );
};

const resolveObservationCommentFilters = async ({
  projectId,
  filter,
}: {
  projectId: string;
  filter: FilterCondition[];
}): Promise<FilterCondition[]> => {
  // Observation comments live in Postgres, while the event and legacy
  // observation streams query ClickHouse. Resolve comment predicates to an
  // observation ID predicate before constructing either stream.
  const { filterState, hasNoMatches } = await applyCommentFilters({
    filterState: filter,
    prisma,
    projectId,
    objectType: "OBSERVATION",
  });

  // applyCommentFilters removes the resolved comment predicates. If none
  // matched, passing filterState alone could leave the stream unconstrained,
  // so encode an explicitly empty selection and let the batch action complete.
  return hasNoMatches
    ? [
        {
          type: "stringOptions",
          operator: "any of",
          column: "id",
          value: [],
        },
      ]
    : filterState;
};

type HandleBatchActionJobDeps = {
  evalCreatorQueue?: Queue<TQueueJobTypes[QueueName.CreateEvalQueue]>;
};

/**
 * ⚠️ All operations must be idempotent. In case of failure, the job should be retried.
 * If it does, chunks that have already been processed might be processed again.
 */
async function processActionChunk(
  actionId: string,
  chunkIds: string[],
  projectId: string,
  targetId?: string,
): Promise<void> {
  try {
    switch (actionId) {
      case "trace-delete":
        // Legacy queue path. Durable trace-delete BatchActions are processed
        // by TraceDeleteBatchActionRunner.
        await traceDeletionProcessor(projectId, chunkIds, { delayMs: 0 });
        break;

      case "trace-add-to-annotation-queue":
        await processAddTracesToQueue(projectId, chunkIds, targetId as string);
        break;

      case "session-add-to-annotation-queue":
        await processAddSessionsToQueue(
          projectId,
          chunkIds,
          targetId as string,
        );
        break;

      case "observation-add-to-annotation-queue":
        await processAddObservationsToQueue(
          projectId,
          chunkIds,
          targetId as string,
        );
        break;

      case "score-delete":
        await processClickhouseScoreDelete(projectId, chunkIds);
        break;

      case "dataset-delete":
        await processDeleteDatasets(projectId, chunkIds);
        break;

      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  } catch (error) {
    logger.error(`Failed to process chunk`, { error, chunkIds });
    throw error;
  }
}

export type TraceRowForEval = {
  id: string;
  projectId: string;
  timestamp: Date;
};

export type DatasetRunItemRowForEval = {
  id: string;
  projectId: string;
  datasetItemId: string;
  traceId: string;
  observationId: string | null;
};
const assertIsTracesTableRecord = (
  element: unknown,
): element is TraceRowForEval => {
  return (
    typeof element === "object" &&
    element !== null &&
    "id" in element &&
    "projectId" in element &&
    "timestamp" in element
  );
};

const assertIsDatasetRunItemTableRecord = (
  element: unknown,
): element is DatasetRunItemRowForEval => {
  return (
    typeof element === "object" &&
    element !== null &&
    "id" in element &&
    "projectId" in element &&
    "datasetItemId" in element &&
    "traceId" in element &&
    "observationId" in element
  );
};

export const handleBatchActionJob = async (
  batchActionJob: Job<TQueueJobTypes[QueueName.BatchActionQueue]>["data"],
  deps: HandleBatchActionJobDeps = {},
) => {
  const batchActionEvent: BatchActionProcessingEventType =
    batchActionJob.payload;

  const { actionId } = batchActionEvent;

  const span = getCurrentSpan();
  if (span) {
    span.setAttribute(
      "messaging.bullmq.job.input.projectId",
      batchActionEvent.projectId,
    );
    span.setAttribute(
      "messaging.bullmq.job.input.actionId",
      batchActionEvent.actionId,
    );
  }

  if (
    actionId === "trace-delete" ||
    actionId === "trace-add-to-annotation-queue" ||
    actionId === "session-add-to-annotation-queue" ||
    actionId === "observation-add-to-annotation-queue" ||
    actionId === "score-delete" ||
    actionId === "dataset-delete"
  ) {
    const { projectId, tableName, query, cutoffCreatedAt, targetId, type } =
      batchActionEvent;

    if (type === BatchActionType.Create && !targetId) {
      throw new Error(`Target ID is required for create action`);
    }

    const convertedFilter = convertDatesInFiltersFromStrings(
      query.filter ?? [],
    );
    const filter =
      actionId === "observation-add-to-annotation-queue"
        ? await resolveObservationCommentFilters({
            projectId,
            filter: convertedFilter,
          })
        : convertedFilter;

    const streamParams = {
      projectId: projectId,
      cutoffCreatedAt: new Date(cutoffCreatedAt),
      filter,
      searchQuery: query.searchQuery ?? undefined,
      searchType: query.searchType ?? ["id" as const],
    };

    const dbReadStream =
      actionId === "dataset-delete"
        ? await findDatasetIdsForBatchDeletion({
            projectId,
            cutoffCreatedAt: new Date(cutoffCreatedAt),
            query,
          })
        : actionId === "trace-delete"
          ? await getTraceIdentifierStream({
              ...streamParams,
              orderBy: query.orderBy,
            })
          : tableName === BatchTableNames.Events
            ? await getEventsStreamForAnnotationQueue(streamParams)
            : tableName === BatchTableNames.Observations
              ? await getObservationStream(streamParams)
              : await getDatabaseReadStreamPaginated({
                  ...streamParams,
                  orderBy: query.orderBy,
                  tableName: tableName as BatchTableNames,
                  useEventsTable: query.useEventsTable,
                });

    // Process stream in database-sized batches
    // 1. Read all records
    const records: any[] = [];
    for await (const record of dbReadStream) {
      if (record?.id) {
        records.push(record);
      }
    }

    // 2. Process in chunks
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const batch = records.slice(i, i + CHUNK_SIZE);

      await processActionChunk(
        actionId,
        batch.map((r) => r.id),
        projectId,
        targetId,
      );
    }
  } else if (actionId === "eval-create") {
    // if a user wants to apply evals for historic traces or dataset runs, we do this here.
    // 1) we fetch data from the database, 2) we create eval executions in batches, 3) we create eval execution jobs for each batch
    const { projectId, query, targetObject, configId, cutoffCreatedAt } =
      batchActionEvent;

    const ruleConfig = await prisma.evaluationRule.findUnique({
      where: {
        id: configId,
        projectId: projectId,
      },
      select: {
        delay: true,
        assignments: {
          take: 1,
          select: {
            evaluator: { select: { type: true } },
          },
        },
      },
    });

    if (!ruleConfig) {
      logger.error(
        `Eval config ${configId} not found for project ${projectId}`,
      );
      return;
    }

    if (
      ruleConfig.assignments.length !== 1 ||
      ruleConfig.assignments[0]?.evaluator.type !==
        EvalTemplateType.LLM_AS_JUDGE
    ) {
      logger.info(`Skipping historical eval-create for non-LLM evaluator`, {
        projectId,
        configId,
        evaluatorType: ruleConfig.assignments[0]?.evaluator.type ?? null,
      });
      return;
    }

    const dbReadStream =
      targetObject === EvalTargetObject.TRACE
        ? await getTraceIdentifierStream({
            projectId: projectId,
            cutoffCreatedAt: new Date(cutoffCreatedAt),
            filter: convertDatesInFiltersFromStrings(query.filter ?? []),
            orderBy: query.orderBy,
            searchQuery: query.searchQuery ?? undefined,
            searchType: query.searchType,
            rowLimit: env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT,
          }) // when reading from clickhouse, we only want to read the necessary identifiers.
        : await getDatabaseReadStreamPaginated({
            projectId: projectId,
            cutoffCreatedAt: new Date(cutoffCreatedAt),
            filter: convertDatesInFiltersFromStrings(query.filter ?? []),
            orderBy: query.orderBy,
            tableName: BatchTableNames.DatasetRunItems,
            rowLimit: env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT,
          });

    const evalCreatorQueue =
      deps.evalCreatorQueue ?? CreateEvalQueue.getInstance();
    if (!evalCreatorQueue) {
      logger.error("CreateEvalQueue is not initialized");
      return;
    }

    let count = 0;
    for await (const record of dbReadStream) {
      if (
        targetObject === EvalTargetObject.TRACE &&
        assertIsTracesTableRecord(record)
      ) {
        const payload = {
          projectId: record.projectId,
          traceId: record.id,
          configId: configId,
          timestamp: new Date(record.timestamp),
          exactTimestamp: new Date(record.timestamp),
        };

        await evalCreatorQueue.add(QueueJobs.CreateEvalJob, {
          payload,
          id: randomUUID(),
          timestamp: new Date(),
          name: QueueJobs.CreateEvalJob as const,
        });
        count++;
      } else if (
        targetObject === EvalTargetObject.DATASET &&
        assertIsDatasetRunItemTableRecord(record)
      ) {
        const payload = {
          projectId: record.projectId,
          datasetItemId: record.datasetItemId,
          traceId: record.traceId,
          observationId: record.observationId ?? undefined,
          configId: configId,
          //We need to set this to be able to fetch traces from the past. We cannot infer from the dataset run when the trace was created.
          timestamp: new Date("2020-01-01"),
        };

        await evalCreatorQueue.add(
          QueueJobs.CreateEvalJob,
          {
            payload,
            id: randomUUID(),
            timestamp: new Date(),
            name: QueueJobs.CreateEvalJob as const,
          },
          { delay: ruleConfig.delay },
        );
        count++;
      } else {
        logger.error(
          "Record is not a valid traces table or dataset record",
          record,
        );
      }
    }
    logger.info(
      `Batch action job completed, projectId: ${batchActionJob.payload.projectId}, ${count} elements`,
    );
  } else if (actionId === "observation-add-to-dataset") {
    const {
      projectId,
      query,
      cutoffCreatedAt,
      config,
      batchActionId,
      tableName,
    } = batchActionEvent;

    // Parse and validate config
    const parsedConfig = ObservationAddToDatasetConfigSchema.parse(config);

    // Get observation stream — use events table when tableName indicates it
    const convertedFilter = convertDatesInFiltersFromStrings(
      query.filter ?? [],
    );
    const filter = await resolveObservationCommentFilters({
      projectId,
      filter: convertedFilter,
    });

    const streamParams = {
      projectId,
      cutoffCreatedAt: new Date(cutoffCreatedAt),
      filter,
      searchQuery: query.searchQuery ?? undefined,
      searchType: query.searchType ?? ["id" as const],
    };
    const dbReadStream =
      tableName === BatchTableNames.Events
        ? await getEventsStreamForDataset(streamParams)
        : await getObservationStream(streamParams);

    // Collect all observations
    const observations: Array<{
      id: string;
      traceId: string;
      input: unknown;
      output: unknown;
      metadata: unknown;
    }> = [];

    for await (const record of dbReadStream) {
      if (record?.id) {
        observations.push({
          id: record.id,
          traceId: record.traceId,
          input: record.input,
          output: record.output,
          metadata: record.metadata,
        });
      }
    }

    // Process observations and add to dataset
    await processAddObservationsToDataset({
      projectId,
      batchActionId: batchActionId as string,
      config: parsedConfig,
      observations,
    });
  } else if (actionId === "observation-run-batched-evaluation") {
    const {
      projectId,
      query,
      cutoffCreatedAt,
      evaluatorIds,
      batchActionId,
      evalVersion,
      evaluatorMappings,
    } = batchActionEvent;

    if (!batchActionId) {
      throw new Error(
        "batchActionId is required for observation-run-batched-evaluation action",
      );
    }

    const selectedEvaluatorIds = Array.from(new Set(evaluatorIds));

    let evaluators;
    let evaluatorLabels: string[];
    try {
      // for jobs dispatched after eval v2 migration
      if (evalVersion === "v2") {
        const stableEvaluators = await prisma.evaluator.findMany({
          where: { id: { in: selectedEvaluatorIds }, projectId },
          select: {
            id: true,
            name: true,
            projectId: true,
            type: true,
            blockedAt: true,
            versions: {
              orderBy: { version: "desc" },
              take: 1,
              select: { id: true, variableMapping: true },
            },
            assignments: {
              where: { projectId },
              orderBy: { evaluationRuleId: "asc" },
              take: 1,
              select: { evaluationRuleId: true },
            },
          },
        });

        evaluatorLabels = stableEvaluators.map(({ name }) => name);
        const mappingByEvaluatorId = new Map(
          (evaluatorMappings ?? []).map((mapping) => [
            mapping.evaluatorId,
            mapping.variableMapping,
          ]),
        );
        // A batch run addresses the evaluator directly (`ruleId` stays null),
        // but uses a deterministic associated rule as its legacy execution
        // anchor so existing readers can still find it.
        evaluators = stableEvaluators.map((evaluator) => ({
          // use the first rule ID so that we stay compatible with the way the old job execution
          // log works
          id: evaluator.assignments[0]?.evaluationRuleId ?? evaluator.id,
          ruleId: null,
          projectId,
          filter: [] as [],
          sampling: new Decimal(1),
          status: JobConfigState.ACTIVE,
          targetObject: EvalTargetObject.EVENT,
          assignments: [
            {
              id: evaluator.id,
              evaluatorId: evaluator.id,
              variableMapping: mappingByEvaluatorId.get(evaluator.id) ?? null,
              evaluator: {
                id: evaluator.id,
                projectId: evaluator.projectId,
                type: evaluator.type,
                blockedAt: evaluator.blockedAt,
                versions: evaluator.versions,
              },
            },
          ],
        }));
      } else {
        // for jobs dispatched before eval v2 migration but processed by new workers
        const rawEvaluators = await prisma.evaluationRule.findMany({
          where: {
            id: { in: selectedEvaluatorIds },
            projectId,
          },
          include: {
            assignments: {
              include: {
                evaluator: {
                  include: {
                    versions: {
                      orderBy: { version: "desc" },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        });

        evaluatorLabels = rawEvaluators.map(({ name }) => name);
        // For batch evaluation the user's table-level selection determines
        // which observations to evaluate, so every config matches every row.
        // The experiment target still has to keep its root-span constraint,
        // which the canonical representation expresses as a filter.
        evaluators = rawEvaluators.map((rule) => ({
          ...rule,
          ruleId: rule.id,
          ...normalizeEvaluationRuleTarget({
            targetObject: rule.targetObject as
              | typeof EvalTargetObject.EVENT
              | typeof EvalTargetObject.EXPERIMENT,
            filter: [],
          }),
          sampling: new Decimal(1),
        }));
      }
    } catch (error) {
      await prisma.batchAction.update({
        where: { id: batchActionId },
        data: {
          status: BatchActionStatus.Failed,
          finishedAt: new Date(),
          totalCount: 0,
          processedCount: 0,
          failedCount: 0,
          log:
            error instanceof Error
              ? error.message
              : "Selected evaluators are missing or invalid for historical evaluation.",
        },
      });

      return;
    }

    const filter = await resolveObservationCommentFilters({
      projectId,
      filter: convertDatesInFiltersFromStrings(query.filter ?? []),
    });

    const dbReadStream = await getEventsStreamForEval({
      projectId,
      cutoffCreatedAt: new Date(cutoffCreatedAt),
      filter,
      searchQuery: query.searchQuery ?? undefined,
      searchType: query.searchType ?? ["id", "content"],
      rowLimit: env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT,
    });

    await processBatchedObservationEval({
      projectId,
      batchActionId,
      evaluators,
      evaluatorLabels,
      observationStream: dbReadStream,
    });
  }

  logger.info(
    `Batch action job completed, projectId: ${batchActionJob.payload.projectId}, actionId: ${actionId}`,
  );
};
