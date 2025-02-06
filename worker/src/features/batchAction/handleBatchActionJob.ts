import {
  BatchActionProcessingEventType,
  logger,
  QueueName,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import z from "zod";
import { orderBy } from "../../../../packages/shared/dist/src/interfaces/orderBy";
import {
  ACTION_ACCESS_MAP,
  BatchExportTableName,
  singleFilter,
} from "@langfuse/shared";
import { getDatabaseReadStream } from "../batchExport/handleBatchExportJob";
import { processClickhouseTraceDelete } from "../traces/processClickhouseTraceDelete";
import { env } from "../../env";
import { Job } from "bullmq";
import { processAddToQueue } from "./processAddToQueue";
import { processPostgresTraceDelete } from "../traces/processPostgresTraceDelete";

export const BatchActionQuerySchema = z.object({
  filter: z.array(singleFilter).nullable(),
  orderBy,
});

const BatchActionJobProgressSchema = z.number();

const CHUNK_SIZE = 1000;
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
  const { projectId, actionId, tableName, query, cutoffCreatedAt, targetId } =
    batchActionEvent;

  const { type } =
    ACTION_ACCESS_MAP[actionId as keyof typeof ACTION_ACCESS_MAP];

  if (type == "create" && !targetId) {
    throw new Error(`Target ID is required for create action`);
  }

  // Parse query from job
  const parsedQuery = BatchActionQuerySchema.safeParse(JSON.parse(query));
  if (!parsedQuery.success) {
    throw new Error(
      `Failed to parse query in project ${projectId} for ${actionId}: ${parsedQuery.error.message}`,
    );
  }

  // Load processed chunk count from job metadata
  const jobProgress = batchActionJob.progress ?? 0;
  const parsedJobProgress = BatchActionJobProgressSchema.safeParse(jobProgress);
  if (!parsedJobProgress.success) {
    throw new Error(
      `Failed to parse job progress in project ${projectId} for ${actionId}: ${parsedJobProgress.error.message}`,
    );
  }

  // TODO: given retries must skip any item we have already processed
  const dbReadStream = await getDatabaseReadStream({
    projectId: projectId,
    cutoffCreatedAt: new Date(cutoffCreatedAt),
    ...parsedQuery.data,
    tableName: tableName as BatchExportTableName,
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

  logger.info("Select all job completed", {
    projectId,
    actionId,
    tableName,
  });
};
