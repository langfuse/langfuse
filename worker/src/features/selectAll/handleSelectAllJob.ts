import {
  logger,
  SelectAllProcessingEventType,
} from "@langfuse/shared/src/server";
import z from "zod";
import { orderBy } from "../../../../packages/shared/dist/src/interfaces/orderBy";
import { BatchExportTableName, singleFilter } from "@langfuse/shared";
import { getDatabaseReadStream } from "../batchExport/handleBatchExportJob";
import { processClickhouseTraceDelete } from "../traces/processClickhouseTraceDelete";
import { env } from "../../env";

export const SelectAllQuerySchema = z.object({
  filter: z.array(singleFilter).nullable(),
  orderBy,
});

const CHUNK_SIZE = 1000;
async function processActionChunk(
  actionId: string,
  chunkIds: string[],
  projectId: string,
): Promise<void> {
  try {
    switch (actionId) {
      case "trace-delete":
        await processClickhouseTraceDelete(projectId, chunkIds);
        break;
      case "trace-add-to-annotation-queue":
        // await processAddToQueue(chunkIds, projectId, targetId);
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
  selectAllEvent: SelectAllProcessingEventType,
) => {
  const { projectId, actionId, tableName, query, cutoffCreatedAt } =
    selectAllEvent;

  // Parse query from job
  const parsedQuery = SelectAllQuerySchema.safeParse(JSON.parse(query));
  if (!parsedQuery.success) {
    throw new Error(
      `Failed to parse query in project ${projectId} for ${actionId}: ${parsedQuery.error.message}`,
    );
  }

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
  for await (const record of dbReadStream) {
    if (record?.id) {
      batch.push(record.id);
    }

    // When batch reaches 1000, process it and reset
    if (batch.length >= CHUNK_SIZE) {
      await processActionChunk(actionId, batch, projectId);
      batch = [];
    }
  }

  // Process any remaining records
  if (batch.length > 0) {
    await processActionChunk(actionId, batch, projectId);
  }

  logger.info("Select all job completed", {
    projectId,
    actionId,
    tableName,
  });
};
