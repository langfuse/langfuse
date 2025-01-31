import {
  logger,
  SelectAllProcessingEventType,
} from "@langfuse/shared/src/server";
import z from "zod";
import { orderBy } from "../../../../packages/shared/dist/src/interfaces/orderBy";
import {
  BatchExportTableName,
  SelectAllTableName,
  singleFilter,
} from "@langfuse/shared";
import { getDatabaseReadStream } from "../batchExport/handleBatchExportJob";
import { chunk } from "lodash";
import { processClickhouseTraceDelete } from "../traces/processClickhouseTraceDelete";

export const SelectAllQuerySchema = z.object({
  tableName: z.nativeEnum(SelectAllTableName),
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
  const parsedQuery = SelectAllQuerySchema.safeParse(query);
  if (!parsedQuery.success) {
    throw new Error(
      `Failed to parse query in project ${projectId} for ${actionId}: ${parsedQuery.error.message}`,
    );
  }

  // TODO: given retries must skip any item we have already processed
  const dbReadStream = await getDatabaseReadStream({
    projectId: projectId,
    cutoffCreatedAt,
    ...parsedQuery.data,
    tableName: tableName as BatchExportTableName,
  });

  let pendingIds: string[] = [];

  // Process stream
  for await (const batch of dbReadStream) {
    const batchIds = (batch as Array<{ id: string }>).map((item) => item.id);
    pendingIds.push(...batchIds);

    // Process when we have enough ids to make a chunk
    if (pendingIds.length >= CHUNK_SIZE) {
      const chunks = chunk(pendingIds, CHUNK_SIZE);
      await Promise.all(
        chunks.map((chunkIds) =>
          processActionChunk(actionId, chunkIds, projectId),
        ),
      );
      pendingIds = [];
    }
  }

  // Process any remaining ids
  if (pendingIds.length > 0) {
    await processActionChunk(actionId, pendingIds, projectId);
  }

  logger.info("Select all job completed", { projectId, actionId, tableName });
};
