import {
  BatchActionProcessingEventType,
  logger,
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
        await processPostgresTraceDelete(projectId, chunkIds);
        await processClickhouseTraceDelete(projectId, chunkIds);
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

export const handleBatchActionJob = async (
  batchActionJob: Job<TQueueJobTypes[QueueName.BatchActionQueue]>,
) => {
  const batchActionEvent: BatchActionProcessingEventType =
    batchActionJob.data.payload;
  const {
    projectId,
    actionId,
    tableName,
    query,
    cutoffCreatedAt,
    targetId,
    type,
  } = batchActionEvent;

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

  logger.info("Batch action job completed", {
    projectId,
    actionId,
    tableName,
  });
};
