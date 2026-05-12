import {
  BatchActionProcessingEventType,
  CreateEvalQueue,
  getCurrentSpan,
  logger,
  QueueJobs,
  QueueName,
  TQueueJobTypes,
  traceDeletionProcessor,
} from "@langfuse/shared/src/server";
import {
  BatchActionType,
  BatchActionStatus,
  BatchTableNames,
  FilterCondition,
  EvalTargetObject,
} from "@langfuse/shared";
import Decimal from "decimal.js";
import {
  getDatabaseReadStreamPaginated,
  getTraceIdentifierStream,
  getSessionIdentifierStream,
  getObservationIdentifierStream,
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
  getEventsStreamForEval,
  getEventsStreamForDataset,
} from "../database-read-stream/event-stream";
import { processAddObservationsToDataset } from "./processAddObservationsToDataset";
import { ObservationAddToDatasetConfigSchema } from "@langfuse/shared";
import { processBatchedObservationEval } from "./processBatchedObservationEval";

const convertDatesInFiltersFromStrings = (filters: FilterCondition[]) => {
  return filters.map((f: FilterCondition) =>
    f.type === "datetime" ? { ...f, value: new Date(f.value) } : f,
  );
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
    actionId === "score-delete"
  ) {
    const { projectId, tableName, query, cutoffCreatedAt, targetId, type } =
      batchActionEvent;

    if (type === BatchActionType.Create && !targetId) {
      throw new Error(`Target ID is required for create action`);
    }

    // Annotation-queue actions only need record IDs — use lightweight identifier
    // streams to avoid fetching input/output/metadata/scores into memory.
    const dbReadStream =
      actionId === "trace-delete" ||
      actionId === "trace-add-to-annotation-queue"
        ? await getTraceIdentifierStream({
            projectId: projectId,
            cutoffCreatedAt: new Date(cutoffCreatedAt),
            filter: convertDatesInFiltersFromStrings(query.filter ?? []),
            orderBy: query.orderBy,
            searchQuery: query.searchQuery ?? undefined,
            searchType: query.searchType ?? ["id" as const],
          })
        : actionId === "session-add-to-annotation-queue"
          ? await getSessionIdentifierStream({
              projectId: projectId,
              cutoffCreatedAt: new Date(cutoffCreatedAt),
              filter: convertDatesInFiltersFromStrings(query.filter ?? []),
              orderBy: query.orderBy,
              searchQuery: query.searchQuery ?? undefined,
              searchType: query.searchType ?? ["id" as const],
            })
          : actionId === "observation-add-to-annotation-queue"
            ? await getObservationIdentifierStream({
                projectId: projectId,
                cutoffCreatedAt: new Date(cutoffCreatedAt),
                filter: convertDatesInFiltersFromStrings(query.filter ?? []),
                searchQuery: query.searchQuery ?? undefined,
                searchType: query.searchType ?? ["id" as const],
              })
            : tableName === BatchTableNames.Observations
              ? await getObservationStream({
                  projectId: projectId,
                  cutoffCreatedAt: new Date(cutoffCreatedAt),
                  filter: convertDatesInFiltersFromStrings(query.filter ?? []),
                  searchQuery: query.searchQuery ?? undefined,
                  searchType: query.searchType ?? ["id" as const],
                })
              : await getDatabaseReadStreamPaginated({
                  projectId: projectId,
                  cutoffCreatedAt: new Date(cutoffCreatedAt),
                  filter: convertDatesInFiltersFromStrings(query.filter ?? []),
                  orderBy: query.orderBy,
                  tableName: tableName as BatchTableNames,
                  searchQuery: query.searchQuery ?? undefined,
                  searchType: query.searchType ?? ["id" as const],
                });

    // Stream records in CHUNK_SIZE batches without accumulating the full result
    // set in memory. Previously all records were collected into an array first,
    // which caused the worker to OOM on large selections (5k+ traces).
    let chunk: string[] = [];
    for await (const record of dbReadStream) {
      if (record?.id) {
        chunk.push(record.id);
        if (chunk.length >= env.LANGFUSE_BATCH_ACTION_CHUNK_SIZE) {
          logger.info(
            `Processing chunk of ${chunk.length} records for ${actionId}`,
          );
          await processActionChunk(actionId, chunk, projectId, targetId);
          chunk = [];
        }
      }
    }
    if (chunk.length > 0) {
      await processActionChunk(actionId, chunk, projectId, targetId);
    }
  } else if (actionId === "eval-create") {
    // if a user wants to apply evals for historic traces or dataset runs, we do this here.
    // 1) we fetch data from the database, 2) we create eval executions in batches, 3) we create eval execution jobs for each batch
    const { projectId, query, targetObject, configId, cutoffCreatedAt } =
      batchActionEvent;

    const config = await prisma.jobConfiguration.findUnique({
      where: {
        id: configId,
        projectId: projectId,
      },
    });

    if (!config) {
      logger.error(
        `Eval config ${configId} not found for project ${projectId}`,
      );
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
          { delay: config.delay },
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
    const streamParams = {
      projectId,
      cutoffCreatedAt: new Date(cutoffCreatedAt),
      filter: convertDatesInFiltersFromStrings(query.filter ?? []),
      searchQuery: query.searchQuery ?? undefined,
      searchType: query.searchType ?? ["id" as const],
    };
    const dbReadStream =
      tableName === BatchTableNames.Events
        ? await getEventsStreamForDataset(streamParams)
        : await getObservationStream(streamParams);

    // Stream observations directly to avoid accumulating the full result set
    // in memory (OOM risk for large selections with multi-KB payloads).
    await processAddObservationsToDataset({
      projectId,
      batchActionId: batchActionId as string,
      config: parsedConfig,
      observationStream: dbReadStream,
    });
  } else if (actionId === "observation-run-batched-evaluation") {
    const { projectId, query, cutoffCreatedAt, evaluatorIds, batchActionId } =
      batchActionEvent;

    if (!batchActionId) {
      throw new Error(
        "batchActionId is required for observation-run-batched-evaluation action",
      );
    }

    const selectedEvaluatorIds = Array.from(new Set(evaluatorIds));

    let evaluators;
    try {
      const rawEvaluators = await prisma.jobConfiguration.findMany({
        where: {
          id: { in: selectedEvaluatorIds },
          projectId,
          // Preserve the selected evaluators as-is. Executability is checked
          // later when each scheduling attempt runs.
        },
        select: {
          id: true,
          projectId: true,
          evalTemplateId: true,
          scoreName: true,
          targetObject: true,
          variableMapping: true,
          status: true,
          blockedAt: true,
        },
      });

      // For batch evaluation the user's table-level selection determines which
      // observations to evaluate, so we intentionally set filter=[] and
      // sampling=1 to ensure every streamed observation is evaluated.
      evaluators = rawEvaluators.map((e) => ({
        ...e,
        filter: [] as [],
        sampling: new Decimal(1),
      }));
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

    const dbReadStream = await getEventsStreamForEval({
      projectId,
      cutoffCreatedAt: new Date(cutoffCreatedAt),
      filter: convertDatesInFiltersFromStrings(query.filter ?? []),
      searchQuery: query.searchQuery ?? undefined,
      searchType: query.searchType ?? ["id", "content"],
      rowLimit: env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT,
    });

    await processBatchedObservationEval({
      projectId,
      batchActionId,
      evaluators,
      observationStream: dbReadStream,
    });
  }

  logger.info(
    `Batch action job completed, projectId: ${batchActionJob.payload.projectId}, actionId: ${actionId}`,
  );
};
