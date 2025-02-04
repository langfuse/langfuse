import {
  logger,
  QueueName,
  SelectAllProcessingEventType,
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

export const SelectAllQuerySchema = z.object({
  filter: z.array(singleFilter).nullable(),
  orderBy,
});

const SelectAllJobProgressSchema = z.number();

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
        logger.info(
          `Deleting traces ${JSON.stringify(chunkIds)} in project ${projectId}`,
        );
        await processClickhouseTraceDelete(projectId, chunkIds);
        break;
      case "trace-add-to-annotation-queue":
        logger.info(
          `Adding traces ${JSON.stringify(chunkIds)} to annotation queue ${targetId} in project ${projectId}`,
        );
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

export const handleSelectAllJob = async (
  selectAllJob: Job<TQueueJobTypes[QueueName.SelectAllQueue]>,
) => {
  const selectAllEvent: SelectAllProcessingEventType =
    selectAllJob.data.payload;
  const { projectId, actionId, tableName, query, cutoffCreatedAt, targetId } =
    selectAllEvent;

  const { type } =
    ACTION_ACCESS_MAP[actionId as keyof typeof ACTION_ACCESS_MAP];

  if (type == "create" && !targetId) {
    throw new Error(`Target ID is required for create action`);
  }

  // Parse query from job
  const parsedQuery = SelectAllQuerySchema.safeParse(JSON.parse(query));
  if (!parsedQuery.success) {
    throw new Error(
      `Failed to parse query in project ${projectId} for ${actionId}: ${parsedQuery.error.message}`,
    );
  }

  // Load processed chunk count from job metadata
  const jobProgress = selectAllJob.progress ?? 0;
  const parsedJobProgress = SelectAllJobProgressSchema.safeParse(jobProgress);
  if (!parsedJobProgress.success) {
    throw new Error(
      `Failed to parse job progress in project ${projectId} for ${actionId}: ${parsedJobProgress.error.message}`,
    );
  }

  const processedChunkCount = parsedJobProgress.data;

  // TODO: given retries must skip any item we have already processed
  const dbReadStream = await getDatabaseReadStream({
    projectId: projectId,
    cutoffCreatedAt: new Date(cutoffCreatedAt),
    ...parsedQuery.data,
    tableName: tableName as BatchExportTableName,
    exportLimit: env.SELECT_ALL_EXPORT_ROW_LIMIT,
  });

  // Process stream in database-sized batches
  let batch: string[] = [];
  let chunkCount = 0;
  for await (const record of dbReadStream) {
    if (record?.id) {
      batch.push(record.id);
    }

    // When batch reaches 1000, process it and reset
    if (batch.length >= CHUNK_SIZE) {
      // Skip if we have already processed this chunk
      if (processedChunkCount > chunkCount) {
        // reset batch
        batch = [];
        chunkCount++;
        continue;
      }

      await processActionChunk(actionId, batch, projectId, targetId);

      // Update progress
      chunkCount++;
      selectAllJob.updateProgress(chunkCount);

      // Reset batch
      batch = [];
    }
  }

  // Process any remaining records
  if (batch.length > 0) {
    await processActionChunk(actionId, batch, projectId, targetId);
    chunkCount++;
    selectAllJob.updateProgress(chunkCount);
  }

  logger.info("Select all job completed", {
    projectId,
    actionId,
    tableName,
  });
};
