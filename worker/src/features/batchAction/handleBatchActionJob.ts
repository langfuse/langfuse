import {
  BatchActionProcessingEventType,
  CreateEvalQueue,
  getCurrentSpan,
  logger,
  QueueJobs,
  QueueName,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import {
  BatchActionQuery,
  BatchActionType,
  BatchExportTableName,
  FilterCondition,
} from "@langfuse/shared";
import { getDatabaseReadStream } from "../batchExport/handleBatchExportJob";
import { processClickhouseTraceDelete } from "../traces/processClickhouseTraceDelete";
import { env } from "../../env";
import { Job } from "bullmq";
import { processAddToQueue } from "./processAddToQueue";
import { processPostgresTraceDelete } from "../traces/processPostgresTraceDelete";
import { prisma } from "@langfuse/shared/src/db";
import { randomUUID } from "node:crypto";

const CHUNK_SIZE = 1000;
const convertDatesInQuery = (query: BatchActionQuery) => {
  if (!query.filter) return query;

  return {
    ...query,
    filter: query.filter.map((f: FilterCondition) =>
      f.type === "datetime" ? { ...f, value: new Date(f.value) } : f,
    ),
  };
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
        await Promise.all([
          processPostgresTraceDelete(projectId, chunkIds),
          processClickhouseTraceDelete(projectId, chunkIds),
        ]);
        break;

      case "trace-add-to-annotation-queue":
        await processAddToQueue(projectId, chunkIds, targetId as string);
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
    actionId === "trace-add-to-annotation-queue"
  ) {
    const { projectId, tableName, query, cutoffCreatedAt, targetId, type } =
      batchActionEvent;

    if (type === BatchActionType.Create && !targetId) {
      throw new Error(`Target ID is required for create action`);
    }

    const dbReadStream = await getDatabaseReadStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(cutoffCreatedAt),
      ...convertDatesInQuery(query),
      tableName: tableName as unknown as BatchExportTableName,
      exportLimit: env.BATCH_ACTION_EXPORT_ROW_LIMIT,
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

    const config = await prisma.jobConfiguration.findUnique({
      where: {
        id: configId,
        projectId: projectId,
      },
    });

    if (!config) {
      throw new Error("Eval config not found");
    }

    const dbReadStream = await getDatabaseReadStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(cutoffCreatedAt),
      ...convertDatesInQuery(query),
      tableName:
        targetObject === "trace"
          ? BatchExportTableName.Traces
          : BatchExportTableName.DatasetRunItems,
      exportLimit: env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT,
    });

    const evalCreatorQueue = CreateEvalQueue.getInstance();
    if (!evalCreatorQueue) {
      logger.error("CreateEvalQueue is not initialized");
      return;
    }

    let count = 0;
    for await (const record of dbReadStream) {
      if (targetObject === "trace" && assertIsTracesTableRecord(record)) {
        const payload = {
          projectId: record.projectId,
          traceId: record.id,
          configId: configId,
          timestamp: new Date(record.timestamp),
        };

        await evalCreatorQueue.add(QueueJobs.CreateEvalJob, {
          payload,
          id: randomUUID(),
          timestamp: new Date(),
          name: QueueJobs.CreateEvalJob as const,
        });
        count++;
      } else if (
        targetObject === "dataset" &&
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
      `Batch action job {${count} elements} completed, projectId: ${batchActionJob.payload.projectId}, actionId: ${actionId}`,
    );
  }

  logger.info(
    `Batch action job completed, projectId: ${batchActionJob.payload.projectId}, actionId: ${actionId}`,
  );
};
